const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = 'Jinu82'; // <--- WPISZ TUTAJ
const TB7_PASSWORD = 'skCvR5E#KYdR5V#'; // <--- WPISZ TUTAJ

const builder = new addonBuilder({
    id: "pl.tb7.bridge.v3", // Zmiana ID wymusza na Stremio odświeżenie listy
    version: "1.2.0",
    name: "Moje TB7 Premium",
    description: "Prywatny mostek do TB7.pl",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log("Stremio pyta o ID:", args.id);
    
    // Szybka odpowiedź dla Stremio, żeby nie było timeoutu
    const streams = [];

    try {
        const instance = axios.create({ 
            baseURL: 'https://tb7.pl',
            timeout: 5000, // Krótki czas oczekiwania
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // Logowanie
        await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));
        
        // Pobieranie tytułu z Cinemeta (zewnętrzne API Stremio)
        const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${args.id.split(':')[1]}.json`);
        const query = metaRes.data.meta.name;

        // Szukanie na TB7
        const searchRes = await instance.get(`/search?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(searchRes.data);

        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            if (row.length > 0) {
                const title = $(row[0]).text().trim();
                const link = $(row[0]).find("a").attr("href");
                if (link && link.includes('download')) {
                    streams.push({
                        name: "TB7",
                        title: `⚡ ${title}`,
                        url: `https://tb7.pl${link}`
                    });
                }
            }
        });

    } catch (e) {
        console.log("Błąd serwera:", e.message);
    }

    return { streams: streams };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
