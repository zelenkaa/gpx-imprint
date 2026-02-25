function onDOMContentLoaded() {

    const intervalInput = document.getElementById("intervalInput"); 
    const minInput = document.getElementById("minInput");
    const maxInput = document.getElementById("maxInput");
    const processButton = document.getElementById("processButton");
    const downloadButton = document.getElementById("downloadButton");

    processButton.addEventListener('click', async () => {
        const min_val = Number(minInput.value);
        const max_val = Number(maxInput.value);
        const interval = Number(intervalInput.value);

        const master_gpx = await (await fetch(`./files/dan_jones.gpx`)).text();
        const time_gpx = await (await fetch(`./files/original.gpx`)).text();

        const master_gpx_points = load_gpx_points(master_gpx);
        const time_gpx_points = load_gpx_points(time_gpx);

        process_gpx_interval(master_gpx_points, time_gpx_points, interval, min_val, max_val)
    });

    downloadButton.addEventListener('click', () => {

    });
}

function load_gpx_points(gpxString) {
    const gpx_points = [];

    const xmlString = gpxString;
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    const trkpts = xmlDoc.querySelectorAll("gpx > trk > trkseg > trkpt");

    let pre_lat = null;
    let pre_lon = null;
    let pre_time = null;
    let pre_dis = null;
    let dis_tot = 0;
    for (let i = 0; i < trkpts.length; i++) {
        const trkpt = trkpts[i];
        const lat = trkpt.getAttribute("lat");
        const lon = trkpt.getAttribute("lon");

        const time_ele = trkpt.querySelector("time");

        let time = null;
        if (time_ele)
            time = new Date(time_ele.textContent);

        let dis = 0;
        if (pre_lat && pre_lon) {
            dis = calculateDistance(pre_lat, pre_lon, lat, lon);
            dis_tot += dis;
        }

        const gpx = {
            ind: i,
            lat: lat,
            lon: lon,
            dis: dis,
            dis_tot: dis_tot,
            time: time
        };

        gpx_points.push(gpx);

        pre_lat = lat;
        pre_lon = lon;
        pre_time = time;
        pre_dis = dis;
    }

    return gpx_points;
}

function process_gpx_interval(master_gpx_points, time_gpx_points, interval, min_val, max_val) {
    let restarts = 0;

    const inds = [];
    const msecs = [];

    let count = 0;
    let prev_dist = 0;
    let prev_time = new Date('2026-02-13T18:03:50.000Z');
    let next_point = interval;
    for (let i = 0; i < master_gpx_points.length - 1; i++) {
        const gpx = master_gpx_points[i];

        if (gpx.dis_tot < next_point)
            continue;

        const dist = gpx.dis_tot;
        const time = get_closest_gpx_time(time_gpx_points, gpx.lat, gpx.lon, prev_time, dist, prev_dist, min_val, max_val);

        if (time === null) {
            next_point += interval / 2;
            i = -1;
            restarts++;
            continue;
        }

        const msec = time - prev_time;
        msecs.push(msec);
        inds.push(i);

        prev_time = time;
        prev_dist = dist;
        next_point += interval;
    }

    /*
    const final_time = new Date("2026-02-14T07:32:14.000Z");
    msecs.push(final_time - prev_time);
    */
    inds.push(master_gpx_points.length - 1);

    processGpxPoints(master_gpx_points, inds, msecs);
}

function get_closest_gpx_time(time_gpx_points, lat, lon, prev_time, cur_dist, prev_dist, min_val, max_val) {

    let next_time = null;
    let smallest_distance = null;
    for (let i = 0; i < time_gpx_points.length; i++) {
        const gpx = time_gpx_points[i];
        const time = gpx.time;

        if (time < prev_time)
            continue;

        const dist = calculateDistance(lat, lon, gpx.lat, gpx.lon);

        if (dist > 500)
            continue;

        const time_calc = (time - prev_time) / 1000;
        const dist_calc = (cur_dist - prev_dist) / 1000;

        const time_per_dist = time_calc / dist_calc;

        if (time_per_dist < min_val || time_per_dist > max_val)
            continue;

        if (!smallest_distance || dist < smallest_distance) {
            smallest_distance = dist;
        }

        if (dist < 50) {
            next_time = gpx.time;
        }
    }


    return next_time;
}

function processGpxPoints(gpx_points, inds, msecs) {

    let pre_ind = 0;
    for (let i = 0; i < inds.length; i++) {
        const ind = inds[i];
        const gpx = gpx_points[ind];
        const pre_gpx = gpx_points[pre_ind];

        const seg_dis_tot = gpx.dis_tot - pre_gpx.dis_tot;

        const total_msecs = msecs[i];

        for (let j = pre_ind + 1; j <= ind; j++) {
            const g = gpx_points[j];
            const msec = Math.ceil(g.dis / seg_dis_tot * total_msecs);
            g.msecs = msec;
        }
        pre_ind = ind;
    }

    download_gpx_file(gpx_points);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance * 1000;
}

function is_gpx_within_range(time, prev_time, dist, prev_dist, min_val, max_val) {
    const time_calc = (time - prev_time) / 1000;
    const dist_calc = (dist - prev_dist) / 1000;

    const time_per_dist = time_calc / dist_calc;

    return (time_per_dist >= min_val && time_per_dist <= max_val);
}

function download_gpx_file(gpx_points) {
    const xmlDoc = document.implementation.createDocument(null, "gpx", null);

    const trk = xmlDoc.createElement("trk");

    const name = xmlDoc.createElement("name");

    name.appendChild(xmlDoc.createTextNode("TUM 102"));

    const type = xmlDoc.createElement("type");
    type.appendChild(xmlDoc.createTextNode("running"));

    const trkseg = xmlDoc.createElement("trkseg");

    let date = new Date("2026-02-13T18:03:50.000Z");
    for (let i = 1; i < gpx_points.length; i++) {
        const g = gpx_points[i];
        if (g.msecs)
            date = new Date(date.getTime() + g.msecs);
        else
           continue;

        const trkpt = xmlDoc.createElement("trkpt");
        if (g.lat && g.lon) {
            trkpt.setAttribute("lat", g.lat);
            trkpt.setAttribute("lon", g.lon);
        }

        if (g.ele) {
            const ele = xmlDoc.createElement("ele");
            ele.appendChild(xmlDoc.createTextNode(g.ele));

            trkpt.appendChild(ele);
        }
        const time = xmlDoc.createElement("time");
        time.appendChild(xmlDoc.createTextNode(date.toISOString()));

        trkpt.appendChild(time);

        trkseg.appendChild(trkpt);
    }

    xmlDoc.documentElement.appendChild(trk);
    trk.appendChild(name);
    trk.appendChild(type);
    trk.appendChild(trkseg);

    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(xmlDoc);

    downloadFile(xmlString, 'tarawera.gpx', 'text/xml');
}

function downloadFile(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;
    a.style.display = 'none'; // Hide the element

    document.body.appendChild(a);
    a.click();

    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Release the object URL
}

document.addEventListener('DOMContentLoaded', onDOMContentLoaded);