const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = 'Jinu82'; // <--- WPISZ TUTAJ
const TB7_PASSWORD = 'skCvR5E#KYdR5V#'; // <--- WPISZ TUTAJ

const builder = new addonBuilder({
    id: "org.tb7.beamup",
    version: "1.0.0",
    name: "TB7 Beamup Polish",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function getTitle(id) {
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${id.split(':')[0]}/${id.split(':')[1]}.json`);
        return res.data.meta.name;
    } catch (e) { return null; }
}

builder.defineStreamHandler(async (args) => {
    const title = await getTitle(args.id);
    if (!title) return { streams: [] };
    try {
        const instance = axios.create({ baseURL: 'https://tb7.pl', withCredentials: true });
        await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));
        const searchRes = await instance.get(`/search?q=${encodeURIComponent(title)}`);
        const $ = cheerio.load(searchRes.data);
        const streams = [];
        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            if (row.length > 0) {
                const link = $(row[0]).find("a").attr("href");
                if (link) {
                    streams.push({
                        name: "TB7",
                        title: $(row[0]).text().trim(),
                        url: `https://tb7.pl${link}`
                    });
                }
            }
        });
        return { streams };
    } catch (e) { return { streams: [] }; }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
