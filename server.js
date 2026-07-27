const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();

/* ==========================
   CONFIGURAÇÕES
========================== */

app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: "interhub2026",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 // 1 hora
        }
    })
);

/* ==========================
   ARQUIVOS PÚBLICOS
========================== */

app.use(express.static(path.join(__dirname, "public")));

/* ==========================
   LOGIN ADMIN
========================== */

const ADMIN_USER = "adm26";
const ADMIN_PASS = "interhub2026";

/* ==========================
   MIDDLEWARE DE PROTEÇÃO
========================== */

function verificarAdmin(req, res, next) {

    if (req.session.admin) {
        return next();
    }

    return res.redirect("/loginadm.html");
}

/* ==========================
   LOGIN
========================== */

app.post("/login", (req, res) => {

    const { usuario, senha } = req.body;

    if (
        usuario === ADMIN_USER &&
        senha === ADMIN_PASS
    ) {

        req.session.admin = true;

        console.log("Administrador logado.");

        return res.redirect("/admin");
    }

    return res.send(`
        <h1>Usuário ou senha inválidos.</h1>
        <a href="/loginadm.html">Voltar</a>
    `);

});

/* ==========================
   PAINEL ADMINISTRATIVO
========================== */

app.get("/admin", verificarAdmin, (req, res) => {

    res.sendFile(
        path.join(__dirname, "privado", "admin.html")
    );

});

/* ==========================
   LOGOUT
========================== */

app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            return res.send("Erro ao encerrar sessão.");
        }

        res.clearCookie("connect.sid");

        console.log("Administrador desconectado.");

        res.redirect("/loginadm.html");

    });

});

/* ==========================
   SERVIDOR
========================== */

app.listen(3000, () => {

    console.log(`
==================================
 INTERHUB ONLINE
 http://localhost:3000
==================================
`);

});
