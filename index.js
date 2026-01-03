const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = 'Jinu82'; // <--- WPISZ TUTAJ
const TB7_PASSWORD = 'skCvR5E#KYdR5V#'; // <--- WPISZ TUTAJ

const builder = new addonBuilder({
    id: "org.tb7.beamup.v2", // Zmienione ID, żeby Stremio odświeżyło cache
    version: "1.0.5",
    name: "TB7 Private Bridge",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function getMeta(id) {
    try {
        const type = id.split(':')[0];
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${id.split(':')[1]}.json`);
        return res.data.meta;
    } catch (e) { return null; }
}

builder.defineStreamHandler(async (args) => {
    const meta = await getMeta(args.id);
    if (!meta) return { streams: [] };

    const query = `${meta.name} ${meta.year || ''}`.trim();
    console.log(`--- Szukam w TB7: ${query} ---`);

    try {
        const instance = axios.create({ 
            baseURL: 'https://tb7.pl', 
            withCredentials: true,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // 1. Próba logowania
        const loginPost = await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));
        console.log("Status logowania:", loginPost.status === 200 ? "OK" : "BŁĄD");

        // 2. Szukanie
        const searchRes = await instance.get(`/search?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(searchRes.data);
        const streams = [];

        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            if (row.length > 0) {
                const title = $(row[0]).text().trim();
                const link = $(row[0]).find("a").attr("href");
                
                if (link && link.includes('download')) {
                    streams.push({
                        name: "TB7",
                        title: `📥 ${title}`,
                        url: `https://tb7.pl${link}`
                    });
                }
            }
        });

        console.log(`Znaleziono plików: ${streams.length}`);
        return { streams };

    } catch (e) {
        console.log("Błąd krytyczny:", e.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
