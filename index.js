const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = process.env.TB7_LOGIN; 
const TB7_PASSWORD = process.env.TB7_PASSWORD;

const builder = new addonBuilder({
    id: "pl.tb7.bridge.secure.v1", 
    version: "1.4.2",
    name: "TB7 Secure Bridge",
    description: "Prywatny mostek do TB7.pl z obsługą Environment Variables",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function searchTB7(query) {
    try {
        const instance = axios.create({ 
            baseURL: 'https://tb7.pl',
            timeout: 10000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://tb7.pl/'
            }
        });

        console.log(`Próba logowania użytkownika: ${TB7_LOGIN}`);
        const loginResponse = await instance.post('/login', qs.stringify({ 
            login: TB7_LOGIN, 
            password: TB7_PASSWORD 
        }));

        if (loginResponse.data.includes("Błędny login lub hasło")) {
            console.log("BŁĄD: Niepoprawne dane logowania do TB7!");
            return [];
        }

        console.log(`Szukanie frazy: ${query}`);
        const searchRes = await instance.get(`/search?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(searchRes.data);
        const streams = [];

        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            if (row.length > 0) {
                const title = $(row[0]).text().trim();
                const link = $(row[0]).find("a[href*='download']").attr("href");
                const size = $(row[2]).text().trim() || "N/A";

                if (link) {
                    streams.push({
                        name: "TB7 Premium",
                        title: `📥 ${title}\n📂 Rozmiar: ${size}`,
                        url: `https://tb7.pl${link}`
                    });
                }
            }
        });

        return streams;
    } catch (e) {
        console.log("Błąd podczas komunikacji z TB7:", e.message);
        return [];
    }
}

builder.defineStreamHandler(async (args) => {
    console.log(`--- Nowe żądanie: ${args.id} ---`);
    try {
        const type = args.type;
        const imdbId = args.id.split(':')[1];
        const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
        
        const movieTitle = metaRes.data.meta.name;
        console.log(`Znaleziony tytuł w bazie: ${movieTitle}`);

        const streams = await searchTB7(movieTitle);
        console.log(`Zwracam liczbę źródeł: ${streams.length}`);
        
        return { streams: streams };
    } catch (err) {
        console.log("Błąd pobierania metadanych:", err.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
                }
            }
        });

        return streams;
    } catch (e) {
        console.log("Błąd podczas komunikacji z TB7:", e.message);
        return [];
    }
}

// Obsługa żądań o strumienie od Stremio
builder.defineStreamHandler(async (args) => {
    console.log(`--- Nowe żądanie: ${args.id} ---`);
    
    try {
        // Pobieramy czytelną nazwę filmu z API Stremio (Cinemeta)
        const type = args.type;
        const imdbId = args.id.split(':')[1];
        const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
        
        const movieTitle = metaRes.data.meta.name;
        console.log(`Znaleziony tytuł w bazie: ${movieTitle}`);

        const streams = await searchTB7(movieTitle);
        console.log(`Zwracam liczbę źródeł: ${streams.length}`);
        
        return { streams: streams };
    } catch (err) {
        console.log("Błąd pobierania metadanych:", err.message);
        return { streams: [] };
    }
});

// Start serwera
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
 
