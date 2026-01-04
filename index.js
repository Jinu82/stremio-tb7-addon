const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_COOKIE = process.env.TB7_COOKIE; 

const builder = new addonBuilder({
    id: "pl.tb7.final.v32", 
    version: "3.2.0",
    name: "TB7 Auto-Generator PRO",
    description: "Automatyczne generowanie linków z wyszukiwarki TB7",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- [ZAPYTANIE] ID: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { 
                headers: { 'Accept-Language': 'pl' }
            });
            movieTitle = meta.data.meta.name;
        } catch (e) { 
            movieTitle = imdbId; 
        }
    }

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 25000,
            headers: { 
                'Cookie': TB7_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // 1. WYSZUKIWANIE
        console.log(`[KROK 1] Szukam: ${movieTitle}`);
        const searchRes = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        if (!searchRes.data.includes("Wyloguj")) {
            console.log("[BŁĄD] Brak sesji Jinu82.");
            return { streams: [] };
        }

        const $search = cheerio.load(searchRes.data);
        const streams = [];
        const rows = $search("table tr").get().slice(1, 4); 

        for (const el of rows) {
            const row = $search(el).find("td");
            const linkEl = $search(row[1]).find("a").first();
            const fileName = linkEl.text().trim();
            const prepareUrl = linkEl.attr("href"); //
            const size = $search(row[2]).text().trim();

            if (prepareUrl && fileName.length > 2) {
                try {
                    // 2. KLIKNIĘCIE "POBIERZ"
                    const step2Res = await client.get(prepareUrl);
                    const $step2 = cheerio.load(step2Res.data);
                    
                    // 3. WGRAJ LINKI
                    const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
                    const step3Res = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }), {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });

                    // 4. WYCIĄGNIĘCIE LINKU
                    const $final = cheerio.load(step3Res.data);
                    const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

                    if (finalLink) {
                        console.log(`[SUKCES] Wygenerowano: ${fileName}`);
                        streams.push({
                            name: "TB7 PRO",
                            title: `🚀 ${fileName}\n⚖️ ${size}`,
                            url: finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`
                        });
                    }
                } catch (e) {
                    console.log(`[BŁĄD] ${fileName}: ${e.message}`);
                }
            }
        }
        return { streams: streams };
    } catch (err) {
        console.log(`[BŁĄD KRYTYCZNY]: ${err.message}`);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("SERWER V3.2.0 URUCHOMIONY POPRAWNIE");
