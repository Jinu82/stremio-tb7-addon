const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

// Zaawansowane czyszczenie ciasteczka ze znaków specjalnych
const TB7_COOKIE = (process.env.TB7_COOKIE || "")
    .replace(/[\r\n]+/gm, "") // Usuwa znaki nowej linii
    .trim(); 

const builder = new addonBuilder({
    id: "pl.tb7.final.v332", 
    version: "3.3.2",
    name: "TB7 Auto-Generator PRO",
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
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`);
            movieTitle = meta.data.meta.name;
        } catch (e) { movieTitle = imdbId; }
    }

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 25000,
            headers: { 
                'Cookie': TB7_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://tb7.pl/'
            }
        });

        console.log(`[KROK 1] Szukam: ${movieTitle}`);
        const res = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        if (!res.data.includes("Jinu82") && !res.data.includes("Wyloguj")) {
            console.log("[BŁĄD] Sesja odrzucona. Sprawdź TB7_COOKIE.");
            return { streams: [] };
        }

        const $search = cheerio.load(res.data);
        const streams = [];
        const rows = $search("table tr").get().slice(1, 4); 

        for (const el of rows) {
            const row = $search(el).find("td");
            const linkEl = $search(row[1]).find("a").first();
            const fileName = linkEl.text().trim();
            const prepareUrl = linkEl.attr("href");
            const size = $search(row[2]).text().trim();

            if (prepareUrl && fileName.length > 2) {
                try {
                    console.log(`[KROK 2] Próba generowania: ${fileName}`);
                    const step2Res = await client.get(prepareUrl);
                    const $step2 = cheerio.load(step2Res.data);
                    
                    const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
                    const step3Res = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }), {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });

                    const $final = cheerio.load(step3Res.data);
                    const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

                    if (finalLink) {
                        console.log(`[SUKCES] Wygenerowano: ${finalLink}`);
                        streams.push({
                            name: "TB7 PRO",
                            title: `🚀 ${fileName}\n⚖️ ${size}`,
                            url: finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`
                        });
                    }
                } catch (e) { console.log(`[BŁĄD PLIKU]: ${e.message}`); }
            }
        }
        return { streams: streams };
    } catch (err) {
        console.log(`[BŁĄD KRYTYCZNY]: ${err.message}`);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("SERWER V3.3.2 URUCHOMIONY");
