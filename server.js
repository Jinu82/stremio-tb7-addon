const express = require("express");
const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));

// GLOBALNE WYMUSZENIE JSON DLA MANIFESTU
app.use((req, res, next) => {
    if (req.path === "/manifest.json") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    next();
});

// Serwowanie manifest.json z folderu /data
app.get("/manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.sendFile(path.join(__dirname, "data", "manifest.json"));
});

// Serwowanie logo
app.get("/logo.png", (req, res) => {
    res.sendFile(path.join(__dirname, "logo.png"));
});

// Stremio otwiera /configure → przekierowanie
app.get("/configure", (req, res) => {
    res.redirect("/config");
});

// Pamięć użytkowników
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
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
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

// HANDLER STREAMÓW Z DEBUG LOGAMI
builder.defineStreamHandler(async (args, req) => {
    console.log("=== STREAM HANDLER START ===");
    console.log("Args:", JSON.stringify(args, null, 2));

    const user = getUser(req);
    console.log("User:", user);

    if (!user.login || !user.password) {
        console.log("Brak loginu/hasła");
        return { streams: [] };
    }

    if (!user.cookie) {
        console.log("Logowanie do TB7...");
        const ok = await loginToTB7(user);
        console.log("Login OK:", ok);
        if (!ok) return { streams: [] };
    }

    const imdbId = args.id.split(":")[0];
    console.log("IMDB:", imdbId);

    let title = imdbId;

    try {
        const meta = await axios.get(
            `https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`
        );
        title = meta.data.meta.name;
        console.log("Tytuł:", title);
    } catch (e) {
        console.log("Meta error:", e.message);
    }

    try {
        const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
        const searchUrl = `https://tb7.pl/mojekonto/szukaj?q=${encodeURIComponent(cleanTitle)}`;
        console.log("TB7 search:", searchUrl);

        let searchRes = await axios.get(searchUrl, {
            headers: { Cookie: user.cookie }
        });

        console.log("HTML length:", searchRes.data.length);

        const $ = cheerio.load(searchRes.data);
        const results = $("a[href*='/mojekonto/pobierz/']");
        console.log("Znaleziono:", results.length);

        if (results.length === 0) return { streams: [] };

        const first = results.first();
        const fileName = first.text().trim();
        const prepareUrl = first.attr("href");

        console.log("Pierwszy wynik:", fileName, prepareUrl);

        const step2 = await axios.get(`https://tb7.pl${prepareUrl}`, {
            headers: { Cookie: user.cookie }
        });

        const $step2 = cheerio.load(step2.data);
        const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";

        console.log("Form action:", formAction);

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

        console.log("Final link:", finalLink);

        if (!finalLink) return { streams: [] };

        const streamUrl = finalLink.startsWith("http")
            ? finalLink
            : `https://tb7.pl${finalLink}`;

        console.log("Zwracam stream:", streamUrl);

        return {
            streams: [
                {
                    name: "TB7 PL",
                    title: fileName,
                    url: streamUrl
                }
            ]
        };
    } catch (e) {
        console.log("STREAM ERROR:", e.message);
        return { streams: [] };
    }
});

// ROUTING STREMIO — OBSŁUGA WSZYSTKICH FORMATÓW
app.get("/:resource/:type/:id.json", (req, res) => {
    builder.getInterface().get(req, res);
});

app.get("/:resource/:type/:id", (req, res) => {
    builder.getInterface().get(req, res);
});

app.get("/:resource/:type/:id/:extra", (req, res) => {
    builder.getInterface().get(req, res);
});

// START SERWERA
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log("Addon + panel config działa na porcie", PORT));
