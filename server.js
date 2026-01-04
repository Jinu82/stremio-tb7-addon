const express = require("express");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");
const path = require("path");

// EXPRESS – PANEL KONFIGURACYJNY
const app = express();
app.use(express.urlencoded({ extended: true }));

// Serwowanie manifest.json bezpośrednio z pliku (ważne dla Render!)
app.get("/manifest.json", (req, res) => {
    res.sendFile(path.join(__dirname, "manifest.json"));
});

// Pamięć użytkowników: IP → { login, password, cookie }
const users = new Map();

function getUser(req) {
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    if (!users.has(ip)) users.set(ip, { login: "", password: "", cookie: "" });
    return users.get(ip);
}

async function loginToTB7(user) {
    try {
        const res = await axios.post(
            "https://tb7.pl/logowanie",
            qs.stringify({
                login: user.login,
                haslo: user.password,
                zaloguj: "Zaloguj się"
            }),
            {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 8000
            }
        );

        const cookies = res.headers["set-cookie"];
        if (cookies) {
            user.cookie = cookies.map(c => c.split(";")[0]).join("; ");
            return true;
        }
    } catch (e) {
        console.log("[LOGIN ERROR]", e.message);
    }
    return false;
}

// PANEL KONFIGURACYJNY
app.get("/config", (req, res) => {
    const user = getUser(req);
    res.send(`
        <html><body>
        <h2>Konfiguracja TB7</h2>
        <form method="POST">
            <label>Login TB7:</label><br>
            <input name="login" value="${user.login}" /><br><br>

            <label>Hasło TB7:</label><br>
            <input name="password" type="password" value="${user.password}" /><br><br>

            <button type="submit">Zapisz</button>
        </form>
        </body></html>
    `);
});

app.post("/config", (req, res) => {
    const user = getUser(req);
    user.login = req.body.login;
    user.password = req.body.password;
    user.cookie = "";
    res.send("<h3>Zapisano! Możesz wrócić do Stremio.</h3>");
});

// STREMIO ADDON
const builder = new addonBuilder({
    id: "pl.tb7.configurable",
    version: "5.0.0",
    name: "TB7 POLSKA PRO (Config)",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args, req) => {
    const user = getUser(req);

    if (!user.login || !user.password) {
        return {
            streams: [],
            error: "Wymagana konfiguracja dodatku: odwiedź /config"
        };
    }

    if (!user.cookie) {
        const ok = await loginToTB7(user);
        if (!ok) return { streams: [], error: "Błąd logowania do TB7" };
    }

    const imdbId = args.id.split(":")[0];
    let title = "";

    try {
        const meta = await axios.get(
            `https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`
        );
        title = meta.data.meta.name;
    } catch {
        title = imdbId;
    }

    try {
        const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
        const searchUrl = `https://tb7.pl/mojekonto/szukaj?q=${encodeURIComponent(cleanTitle)}`;

        let searchRes = await axios.get(searchUrl, {
            headers: { Cookie: user.cookie }
        });

        if (!searchRes.data.includes("Wyloguj")) {
            await loginToTB7(user);
            searchRes = await axios.get(searchUrl, {
                headers: { Cookie: user.cookie }
            });
        }

        const $ = cheerio.load(searchRes.data);
        const results = $("a[href*='/mojekonto/pobierz/']");

        if (results.length === 0) return { streams: [] };

        const first = results.first();
        const fileName = first.text().trim();
        const prepareUrl = first.attr("href");

        const step2 = await axios.get(`https://tb7.pl${prepareUrl}`, {
            headers: { Cookie: user.cookie }
        });

        const $step2 = cheerio.load(step2.data);
        const formAction =
            $step2("form").attr("action") || "/mojekonto/sciagaj";

        const step3 = await axios.post(
            `https://tb7.pl${formAction}`,
            qs.stringify({ wgraj: "Wgraj linki" }),
            {
                headers: {
                    Cookie: user.cookie,
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        const $final = cheerio.load(step3.data);
        const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

        if (!finalLink) return { streams: [] };

        return {
            streams: [
                {
                    name: "TB7 PL",
                    title: fileName,
                    url: finalLink.startsWith("http")
                        ? finalLink
                        : `https://tb7.pl${finalLink}`
                }
            ]
        };
    } catch (e) {
        console.log("[STREAM ERROR]", e.message);
        return { streams: [] };
    }
});

// START SERWERA
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
app.listen(7001, () => console.log("Panel konfiguracyjny działa na porcie 7001"));
