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

    // Se for uma API, retorna JSON
    if (req.path.startsWith("/api/")) {
        return res.status(401).json({
            erro: "Sessão expirada. Faça login novamente."
        });
    }

    // Se for uma página normal, volta para o login
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
app.get("/admin/times", verificarAdmin, (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "privado",
            "admin-times.html"
        )
    );

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
   TIMES
========================== */

// CADASTRAR TIME
app.post("/api/times", verificarAdmin, async (req, res) => {

    try {

        const { nome, turma, modalidade } = req.body;

        // Verifica se os campos foram preenchidos
        if (!nome || !turma || !modalidade) {

            return res.status(400).json({
                erro: "Preencha todos os campos."
            });

        }


        // ==========================
        // CADASTRA O TIME
        // ==========================

        const [resultado] = await db.query(
            `
            INSERT INTO times
            (nome, turma, modalidade)
            VALUES (?, ?, ?)
            `,
            [
                nome,
                turma,
                modalidade
            ]
        );


        const timeId = resultado.insertId;


        // ==========================
        // CRIA CLASSIFICAÇÃO
        // ==========================

        await db.query(
            `
            INSERT INTO classificacao
            (
                time_id,
                pontos,
                vitorias,
                empates,
                derrotas
            )
            VALUES (?, 0, 0, 0, 0)
            `,
            [
                timeId
            ]
        );


        console.log(
            "Time cadastrado:",
            nome,
            turma,
            modalidade
        );


        console.log(
            "Classificação criada para o time:",
            timeId
        );


        return res.status(201).json({

            mensagem:
                "Time cadastrado com sucesso!",

            id: timeId

        });


    } catch (erro) {

        console.error(
            "Erro ao cadastrar time:",
            erro
        );


        return res.status(500).json({

            erro:
                "Erro ao cadastrar time."

        });

    }

});


// LISTAR TIMES
app.get("/api/times", async (req, res) => {

    try {

        const { modalidade } = req.query;

        let resultados;

        if (modalidade) {

            [resultados] = await db.query(
                `
                SELECT
                    id,
                    nome,
                    turma,
                    modalidade
                FROM times
                WHERE modalidade = ?
                ORDER BY nome
                `,
                [modalidade]
            );

        } else {

            [resultados] = await db.query(
                `
                SELECT
                    id,
                    nome,
                    turma,
                    modalidade
                FROM times
                ORDER BY nome
                `
            );

        }

        return res.json(resultados);

    } catch (erro) {

        console.error(
            "Erro ao buscar times:",
            erro
        );

        return res.status(500).json({

            erro: "Erro ao carregar times."

        });

    }

});
/* ==========================
   RESULTADOS DOS JOGOS
========================== */


/* ==========================
   CADASTRAR JOGO
========================== */

app.post("/api/jogos", verificarAdmin, async (req, res) => {

    try {

        const {
            time1_id,
            time2_id,
            modalidade,
            data_jogo,
            horario
        } = req.body;

        if (
            !time1_id ||
            !time2_id ||
            !modalidade ||
            !data_jogo ||
            !horario
        ) {

            return res.status(400).json({
                erro: "Preencha todos os campos."
            });

        }

        if (time1_id === time2_id) {

            return res.status(400).json({
                erro: "Os times precisam ser diferentes."
            });

        }

        await db.query(
            `
            INSERT INTO jogos
            (
                time1_id,
                time2_id,
                modalidade,
                data_jogo,
                horario,
                gols_time1,
                gols_time2
            )
            VALUES (?, ?, ?, ?, ?, 0, 0)
            `,
            [
                time1_id,
                time2_id,
                modalidade,
                data_jogo,
                horario
            ]
        );

        console.log(
            "Jogo cadastrado:",
            time1_id,
            time2_id,
            modalidade
        );

        return res.status(201).json({
            mensagem: "Jogo cadastrado com sucesso!"
        });

    } catch (erro) {

        console.error(
            "Erro ao cadastrar jogo:",
            erro
        );

        return res.status(500).json({
            erro: "Erro ao cadastrar jogo."
        });

    }

});


/* ==========================
   LISTAR JOGOS
========================== */

/* ==========================
   LISTAR JOGOS
========================== */

app.get("/api/jogos", async (req, res) => {

    try {

        const [jogos] = await db.query(`
            SELECT
                jogos.id,
                jogos.modalidade,
                jogos.data_jogo,
                jogos.horario,
                jogos.gols_time1,
                jogos.gols_time2,

                t1.nome AS time1,
                t2.nome AS time2

            FROM jogos

            INNER JOIN times t1
                ON jogos.time1_id = t1.id

            INNER JOIN times t2
                ON jogos.time2_id = t2.id

            ORDER BY
                jogos.data_jogo ASC,
                jogos.horario ASC
        `);

        return res.status(200).json(jogos);

    } catch (erro) {

        console.error("Erro ao buscar jogos:", erro);

        return res.status(500).json({
            erro: "Erro ao carregar jogos."
        });

    }

});
app.post("/api/jogos/resultado", verificarAdmin, async (req, res) => {
    try {

        const {
            jogo_id,
            gols_time1,
            gols_time2
        } = req.body;


        // Verifica os dados
        if (
            !jogo_id ||
            gols_time1 === undefined ||
            gols_time2 === undefined
        ) {

            return res.status(400).json({
                erro: "Preencha todos os campos."
            });

        }


        // Busca o jogo
        const [jogos] = await db.query(
            `
            SELECT
                time1_id,
                time2_id,
                gols_time1,
                gols_time2
            FROM jogos
            WHERE id = ?
            `,
            [jogo_id]
        );


        if (jogos.length === 0) {

            return res.status(404).json({
                erro: "Jogo não encontrado."
            });

        }


        const jogo = jogos[0];


        // Atualiza o resultado do jogo
        await db.query(
            `
            UPDATE jogos
            SET
                gols_time1 = ?,
                gols_time2 = ?
            WHERE id = ?
            `,
            [
                gols_time1,
                gols_time2,
                jogo_id
            ]
        );


        // ==========================
        // ATUALIZA CLASSIFICAÇÃO
        // ==========================

        if (Number(gols_time1) > Number(gols_time2)) {

            // Time 1 venceu
            await db.query(
                `
                UPDATE classificacao
                SET
                    pontos = pontos + 3,
                    vitorias = vitorias + 1
                WHERE time_id = ?
                `,
                [jogo.time1_id]
            );


            // Time 2 perdeu
            await db.query(
                `
                UPDATE classificacao
                SET
                    derrotas = derrotas + 1
                WHERE time_id = ?
                `,
                [jogo.time2_id]
            );

        }


        else if (Number(gols_time2) > Number(gols_time1)) {

            // Time 2 venceu
            await db.query(
                `
                UPDATE classificacao
                SET
                    pontos = pontos + 3,
                    vitorias = vitorias + 1
                WHERE time_id = ?
                `,
                [jogo.time2_id]
            );


            // Time 1 perdeu
            await db.query(
                `
                UPDATE classificacao
                SET
                    derrotas = derrotas + 1
                WHERE time_id = ?
                `,
                [jogo.time1_id]
            );

        }


        else {

            // Empate
            await db.query(
                `
                UPDATE classificacao
                SET
                    pontos = pontos + 1,
                    empates = empates + 1
                WHERE time_id IN (?, ?)
                `,
                [
                    jogo.time1_id,
                    jogo.time2_id
                ]
            );

        }


        return res.json({
            mensagem: "Resultado registrado e classificação atualizada!"
        });


    } catch (erro) {

        console.error(
            "Erro ao registrar resultado:",
            erro
        );


        return res.status(500).json({
            erro: "Erro ao registrar resultado."
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