const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: "interhub2026",
        resave: false,
        saveUninitialized: false
    })
);

app.use(express.static("public"));

const ADMIN_USER = "adm26";
const ADMIN_PASS = "interhub2026";

app.post("/login", (req, res) => {
    console.log(req.body);

    const { usuario, senha } = req.body;

    if (
        usuario === ADMIN_USER &&
        senha === ADMIN_PASS
    ) {

        req.session.admin = true;

        return res.redirect("/admin");
    }

    res.send("Usuário ou senha inválidos.");
});

function verificarAdmin(req, res, next) {

    if (req.session.admin) {
        return next();
    }

    res.redirect("/loginadm.html");
}

app.get("/admin", verificarAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/logout", (req, res) => {

    req.session.destroy(() => {
        res.redirect("/loginadm.html");
    });

});

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});
