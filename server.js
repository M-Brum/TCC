const express = require("express");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();

/* ==========================
   CONFIGURAÇÕES
========================== */

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret: "interhub2026",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60
        }
    })
);

/* ==========================
   CONEXÃO COM MYSQL
========================== */

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "interhub",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

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
   MIDDLEWARE ADMIN
========================== */

function verificarAdmin(req, res, next) {

    if (req.session.admin === true) {
        return next();
    }

    if (req.path.startsWith("/api/")) {
        return res.status(401).json({
            erro: "Sessão expirada. Faça login novamente."
        });
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
        <a href="/loginadm.html">Voltar para o login</a>
    `);
});

/* ==========================
   PAINEL ADMIN
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

        res.redirect("/loginadm.html");
    });

});

/* ==================================================
   API - TIMES
================================================== */

/* LISTAR TIMES */

app.get("/api/times", async (req, res) => {

    try {

        const { modalidade } = req.query;

        let sql = `
            SELECT id, nome, turma, modalidade
            FROM times
        `;

        const valores = [];

        if (modalidade) {
            sql += ` WHERE modalidade = ?`;
            valores.push(modalidade);
        }

        sql += ` ORDER BY nome ASC`;

        const [times] = await db.query(sql, valores);

        return res.json(times);

    } catch (erro) {

        console.error("Erro ao buscar times:", erro);

        return res.status(500).json({
            erro: "Erro ao carregar os times."
        });
    }
});


/* CADASTRAR TIME */

app.post("/api/times", verificarAdmin, async (req, res) => {

    try {

        const { nome, turma, modalidade } = req.body;

        if (!nome || !turma || !modalidade) {

            return res.status(400).json({
                erro: "Preencha todos os campos."
            });
        }

        const [resultado] = await db.query(
            `
            INSERT INTO times
            (nome, turma, modalidade)
            VALUES (?, ?, ?)
            `,
            [nome, turma, modalidade]
        );

        /* Cria a classificação do time */

        await db.query(
            `
            INSERT INTO classificacao
            (time_id, pontos, vitorias, empates, derrotas)
            VALUES (?, 0, 0, 0, 0)
            `,
            [resultado.insertId]
        );

        return res.status(201).json({
            mensagem: "Time cadastrado com sucesso!",
            id: resultado.insertId
        });

    } catch (erro) {

        console.error("Erro ao cadastrar time:", erro);

        return res.status(500).json({
            erro: "Erro ao cadastrar time."
        });
    }
});


/* ==================================================
   API - JOGOS
================================================== */

/* LISTAR JOGOS */

app.get("/api/jogos", async (req, res) => {

    try {

        const { modalidade } = req.query;

        let sql = `
            SELECT
                jogos.id,
                jogos.modalidade,
                jogos.data_jogo,
                jogos.horario,
                jogos.gols_time1,
                jogos.gols_time2,
                t1.id AS time1_id,
                t1.nome AS time1,
                t2.id AS time2_id,
                t2.nome AS time2
            FROM jogos
            INNER JOIN times t1
                ON jogos.time1_id = t1.id
            INNER JOIN times t2
                ON jogos.time2_id = t2.id
        `;

        const valores = [];

        if (modalidade) {
            sql += ` WHERE jogos.modalidade = ?`;
            valores.push(modalidade);
        }

        sql += `
            ORDER BY jogos.data_jogo ASC,
                     jogos.horario ASC
        `;

        const [jogos] = await db.query(sql, valores);

        return res.json(jogos);

    } catch (erro) {

        console.error("Erro ao buscar jogos:", erro);

        return res.status(500).json({
            erro: "Erro ao carregar jogos."
        });
    }
});


/* CADASTRAR JOGO */

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

        if (String(time1_id) === String(time2_id)) {

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

        return res.status(201).json({
            mensagem: "Jogo cadastrado com sucesso!"
        });

    } catch (erro) {

        console.error("Erro ao cadastrar jogo:", erro);

        return res.status(500).json({
            erro: "Erro ao cadastrar jogo."
        });
    }
});


/* ==================================================
   ATUALIZAR RESULTADO
================================================== */

app.post("/api/jogos/resultado", verificarAdmin, async (req, res) => {

    try {

        const {
            jogo_id,
            gols_time1,
            gols_time2
        } = req.body;

        if (
            jogo_id === undefined ||
            gols_time1 === undefined ||
            gols_time2 === undefined
        ) {

            return res.status(400).json({
                erro: "Informe o jogo e os dois resultados."
            });
        }

        if (
            Number(gols_time1) < 0 ||
            Number(gols_time2) < 0
        ) {

            return res.status(400).json({
                erro: "Os gols não podem ser negativos."
            });
        }

        await db.query(
            `
            UPDATE jogos
            SET gols_time1 = ?,
                gols_time2 = ?
            WHERE id = ?
            `,
            [
                Number(gols_time1),
                Number(gols_time2),
                jogo_id
            ]
        );

        /* Recalcula toda a classificação */

        await recalcularClassificacao();

        return res.json({
            mensagem: "Resultado atualizado com sucesso!"
        });

    } catch (erro) {

        console.error("Erro ao atualizar resultado:", erro);

        return res.status(500).json({
            erro: "Erro ao atualizar resultado."
        });
    }
});


/* ==================================================
   RECALCULAR CLASSIFICAÇÃO
================================================== */

async function recalcularClassificacao() {

    /* Zera a classificação */

    await db.query(`
        UPDATE classificacao
        SET pontos = 0,
            vitorias = 0,
            empates = 0,
            derrotas = 0
    `);


    /* Busca jogos */

    const [jogos] = await db.query(`
        SELECT
            time1_id,
            time2_id,
            gols_time1,
            gols_time2
        FROM jogos
    `);


    /* Calcula jogo por jogo */

    for (const jogo of jogos) {

        const gols1 = Number(jogo.gols_time1);
        const gols2 = Number(jogo.gols_time2);

        /* Vitória do time 1 */

        if (gols1 > gols2) {

            await db.query(
                `
                UPDATE classificacao
                SET pontos = pontos + 3,
                    vitorias = vitorias + 1
                WHERE time_id = ?
                `,
                [jogo.time1_id]
            );

            await db.query(
                `
                UPDATE classificacao
                SET derrotas = derrotas + 1
                WHERE time_id = ?
                `,
                [jogo.time2_id]
            );
        }

        /* Vitória do time 2 */

        else if (gols2 > gols1) {

            await db.query(
                `
                UPDATE classificacao
                SET pontos = pontos + 3,
                    vitorias = vitorias + 1
                WHERE time_id = ?
                `,
                [jogo.time2_id]
            );

            await db.query(
                `
                UPDATE classificacao
                SET derrotas = derrotas + 1
                WHERE time_id = ?
                `,
                [jogo.time1_id]
            );
        }

        /* Empate */

        else {

            await db.query(
                `
                UPDATE classificacao
                SET pontos = pontos + 1,
                    empates = empates + 1
                WHERE time_id IN (?, ?)
                `,
                [jogo.time1_id, jogo.time2_id]
            );
        }
    }
}


/* ==================================================
   API - CLASSIFICAÇÃO
================================================== */

app.get("/api/classificacao", async (req, res) => {

    try {

        const { modalidade } = req.query;

        let sql = `
            SELECT
                classificacao.id,
                classificacao.time_id,
                times.nome,
                times.turma,
                times.modalidade,
                classificacao.pontos,
                classificacao.vitorias,
                classificacao.empates,
                classificacao.derrotas
            FROM classificacao
            INNER JOIN times
                ON classificacao.time_id = times.id
        `;

        const valores = [];

        if (modalidade) {

            sql += `
                WHERE times.modalidade = ?
            `;

            valores.push(modalidade);
        }

        sql += `
            ORDER BY classificacao.pontos DESC,
                     classificacao.vitorias DESC,
                     times.nome ASC
        `;

        const [classificacao] = await db.query(
            sql,
            valores
        );

        return res.json(classificacao);

    } catch (erro) {

        console.error(
            "Erro ao buscar classificação:",
            erro
        );

        return res.status(500).json({
            erro: "Erro ao carregar classificação."
        });
    }
});


/* ==================================================
   TESTE DO BANCO
================================================== */

app.get("/api/teste-banco", async (req, res) => {

    try {

        const [resultado] = await db.query(
            "SELECT 1 AS conectado"
        );

        return res.json({
            mensagem: "Banco conectado com sucesso!",
            resultado
        });

    } catch (erro) {

        console.error("Erro no banco:", erro);

        return res.status(500).json({
            erro: "Não foi possível conectar ao banco.",
            detalhes: erro.message
        });
    }
});


/* ==================================================
   INICIAR SERVIDOR
================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {

    console.log(`
==================================
 INTERHUB ONLINE
 http://localhost:${PORT}
==================================
`);

    try {

        const conexao = await db.getConnection();

        console.log("MySQL conectado com sucesso!");

        conexao.release();

    } catch (erro) {

        console.error(
            "Erro ao conectar ao MySQL:",
            erro.message
        );
    }

});