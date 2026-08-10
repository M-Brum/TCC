require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});



/* ==========================
   CONFIGURAÇÕES
========================== */

// Permite receber dados do formulário de login
app.use(express.urlencoded({ extended: true }));

// Permite receber dados em JSON
app.use(express.json());

// Configuração da sessão do administrador
app.use(
    session({
        secret: process.env.SESSION_SECRET || "interhub_chave_secreta",
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

// Libera apenas os arquivos da pasta "public"
app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/* ==========================
   PROTEÇÃO DO ADMIN
========================== */

function verificarAdmin(req, res, next) {

    // Verifica se o administrador está logado
    if (req.session.admin === true) {
        return next();
    }

    // Se não estiver logado, volta para a tela de login
    return res.redirect("/loginadm.html");
}

/* ==========================
   PÁGINA INICIAL
========================== */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});

/* ==========================
   LOGIN DO ADMINISTRADOR
========================== */

app.post("/login", (req, res) => {

    const { usuario, senha } = req.body;

    // Confere o usuário e a senha do arquivo .env
    if (
        usuario === process.env.ADMIN_USER &&
        senha === process.env.ADMIN_PASS
    ) {

        // Cria a sessão de administrador
        req.session.admin = true;

        console.log("Administrador logado.");

        // Envia para a rota protegida
        return res.redirect("/admin");
    }

    // Se os dados estiverem errados
    return res.send(`
        <h1>Usuário ou senha inválidos.</h1>

        <a href="/loginadm.html">
            Voltar para o login
        </a>
    `);

});

/* ==========================
   PAINEL ADMINISTRATIVO
========================== */

// O admin.html fica na pasta PRIVADO
app.get("/admin", verificarAdmin, (req, res) => {

    const caminhoAdmin = path.join(
        __dirname,
        "privado",
        "admin.html"
    );

    console.log("Abrindo painel em:", caminhoAdmin);

    return res.sendFile(caminhoAdmin);

});

/* ==========================
   LOGOUT
========================== */

app.get("/logout", (req, res) => {

    req.session.destroy((erro) => {

        if (erro) {
            return res.send(
                "Não foi possível encerrar a sessão."
            );
        }

        // Apaga o cookie da sessão
        res.clearCookie("connect.sid");

        console.log("Administrador desconectado.");

        // Volta para a página inicial
        return res.redirect("/");
    });

});
/* ==========================
CLASSIFICAÇÃO
========================== */

app.get("/api/classificacao", async (req, res) => {

    try {

        const [resultados] = await db.query(`
            SELECT
                classificacao.id,
                times.nome AS time,
                times.turma,
                times.modalidade,
                classificacao.pontos,
                classificacao.vitorias,
                classificacao.empates,
                classificacao.derrotas
            FROM classificacao
            INNER JOIN times
                ON classificacao.time_id = times.id
            ORDER BY
                classificacao.pontos DESC,
                classificacao.vitorias DESC,
                classificacao.empates DESC
        `);

        res.json(resultados);

    } catch (erro) {

        console.error(
            "Erro ao buscar classificação:",
            erro
        );

        res.status(500).json({
            erro: "Erro ao carregar classificação."
        });

    }

});

/* ==========================
   SERVIDOR
========================== */

const PORT = process.env.PORT || 3000;
db.getConnection()
    .then(connection => {
        console.log("==================================");
        console.log("BANCO DE DADOS CONECTADO");
        console.log("==================================");

        connection.release();
    })
    .catch(error => {
        console.error("Erro ao conectar ao banco:");
        console.error(error.message);
    });

app.listen(PORT, () => {

    console.log(`
==================================
       INTERHUB ONLINE
http://localhost:${PORT}
==================================
    `);

});