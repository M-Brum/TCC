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

    if (usuario === ADMIN_USER && senha === ADMIN_PASS) {
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

        const modalidadesValidas = [
            "Futsal",
            "Vôlei",
            "Basquete",
            "Videogame",
            "Tênis de Mesa"
        ];

        if (!modalidadesValidas.includes(modalidade)) {
            return res.status(400).json({
                erro: "Selecione uma modalidade válida."
            });
        }

        const [resultado] = await db.query(
            `
            INSERT INTO times
            (nome, turma, modalidade)
            VALUES (?, ?, ?)
            `,
            [nome.trim(), turma.trim(), modalidade]
        );

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
                jogos.resultado_time1,
                jogos.resultado_time2,
                jogos.status,
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

        const id1 = Number(time1_id);
        const id2 = Number(time2_id);

        if (
            !Number.isInteger(id1) ||
            !Number.isInteger(id2) ||
            id1 <= 0 ||
            id2 <= 0
        ) {
            return res.status(400).json({
                erro: "Selecione times válidos."
            });
        }

        if (id1 === id2) {
            return res.status(400).json({
                erro: "Os times precisam ser diferentes."
            });
        }

        const modalidadesValidas = [
            "Futsal",
            "Vôlei",
            "Basquete",
            "Videogame",
            "Tênis de Mesa"
        ];

        if (!modalidadesValidas.includes(modalidade)) {
            return res.status(400).json({
                erro: "Selecione uma modalidade válida."
            });
        }

        const [times] = await db.query(
            `
            SELECT id, modalidade
            FROM times
            WHERE id IN (?, ?)
            `,
            [id1, id2]
        );

        if (times.length !== 2) {
            return res.status(404).json({
                erro: "Um ou ambos os times não foram encontrados."
            });
        }

        const modalidadeIncorreta = times.some(
            time => time.modalidade !== modalidade
        );

        if (modalidadeIncorreta) {
            return res.status(400).json({
                erro: "Os dois times precisam pertencer à modalidade selecionada."
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
                gols_time2,
                resultado_time1,
                resultado_time2,
                status
            )
            VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 'Agendado')
            `,
            [
                id1,
                id2,
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
        const { jogo_id } = req.body;

        const valor1 = req.body.resultado_time1 ?? req.body.gols_time1;
        const valor2 = req.body.resultado_time2 ?? req.body.gols_time2;

        const idJogo = Number(jogo_id);
        const resultado1 = Number(valor1);
        const resultado2 = Number(valor2);

        if (
            !Number.isInteger(idJogo) ||
            idJogo <= 0 ||
            valor1 === undefined ||
            valor1 === null ||
            valor1 === "" ||
            valor2 === undefined ||
            valor2 === null ||
            valor2 === "" ||
            !Number.isInteger(resultado1) ||
            !Number.isInteger(resultado2) ||
            resultado1 < 0 ||
            resultado2 < 0
        ) {
            return res.status(400).json({
                erro: "Informe um jogo válido e resultados inteiros, sem números negativos."
            });
        }

        const [jogos] = await db.query(
            "SELECT id, modalidade FROM jogos WHERE id = ?",
            [idJogo]
        );

        if (jogos.length === 0) {
            return res.status(404).json({
                erro: "Jogo não encontrado."
            });
        }

        const modalidade = jogos[0].modalidade;

        if (modalidade === "Futsal") {
            // O futsal permite empate.
        } else if (modalidade === "Basquete") {
            if (resultado1 === resultado2) {
                return res.status(400).json({
                    erro: "No basquete, a partida precisa ter um vencedor."
                });
            }
        } else if (
            modalidade === "Vôlei" ||
            modalidade === "Tênis de Mesa"
        ) {
            const placarValido =
                (resultado1 === 2 && (resultado2 === 0 || resultado2 === 1)) ||
                (resultado2 === 2 && (resultado1 === 0 || resultado1 === 1));

            if (!placarValido) {
                return res.status(400).json({
                    erro: "O resultado deve ser 2 a 0 ou 2 a 1, pois a partida é decidida por dois sets vencidos."
                });
            }
        } else if (modalidade === "Videogame") {
            const placarValido =
                (resultado1 === 1 && resultado2 === 0) ||
                (resultado1 === 0 && resultado2 === 1);

            if (!placarValido) {
                return res.status(400).json({
                    erro: "No videogame, informe apenas vitória (1) ou derrota (0)."
                });
            }
        } else {
            return res.status(400).json({
                erro: "Modalidade não reconhecida."
            });
        }

        // Mantém os campos antigos para compatibilidade.
        const gols1 = ["Futsal", "Basquete"].includes(modalidade)
            ? resultado1
            : 0;

        const gols2 = ["Futsal", "Basquete"].includes(modalidade)
            ? resultado2
            : 0;

        await db.query(
            `
            UPDATE jogos
            SET resultado_time1 = ?,
                resultado_time2 = ?,
                gols_time1 = ?,
                gols_time2 = ?,
                status = 'Finalizado'
            WHERE id = ?
            `,
            [resultado1, resultado2, gols1, gols2, idJogo]
        );

        await recalcularClassificacao();

        return res.json({
            mensagem: "Resultado atualizado e classificação recalculada com sucesso!"
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
    await db.query(`
        UPDATE classificacao
        SET pontos = 0,
            vitorias = 0,
            empates = 0,
            derrotas = 0,
            saldo = 0
    `);

    const [jogos] = await db.query(`
        SELECT
            time1_id,
            time2_id,
            modalidade,
            resultado_time1,
            resultado_time2
        FROM jogos
        WHERE status = 'Finalizado'
    `);

    for (const jogo of jogos) {
        const resultado1 = Number(jogo.resultado_time1);
        const resultado2 = Number(jogo.resultado_time2);

        /*
           Saldo:
           Futsal: diferença de gols.
           Basquete: diferença de pontos.
           Vôlei e Tênis de Mesa: diferença de sets.
           Videogame: não utiliza saldo como desempate.
        */

        if (jogo.modalidade !== "Videogame") {
            const saldo1 = resultado1 - resultado2;
            const saldo2 = resultado2 - resultado1;

            await db.query(
                `
                UPDATE classificacao
                SET saldo = saldo + ?
                WHERE time_id = ?
                `,
                [saldo1, jogo.time1_id]
            );

            await db.query(
                `
                UPDATE classificacao
                SET saldo = saldo + ?
                WHERE time_id = ?
                `,
                [saldo2, jogo.time2_id]
            );
        }

        // Empate permitido somente no futsal.
        if (
            jogo.modalidade === "Futsal" &&
            resultado1 === resultado2
        ) {
            await db.query(
                `
                UPDATE classificacao
                SET pontos = pontos + 1,
                    empates = empates + 1
                WHERE time_id IN (?, ?)
                `,
                [jogo.time1_id, jogo.time2_id]
            );
        } else if (resultado1 > resultado2) {
            // Vitória do primeiro time.
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
        } else if (resultado2 > resultado1) {
            // Vitória do segundo time.
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
                classificacao.saldo,
                classificacao.empates,
                classificacao.derrotas
            FROM classificacao
            INNER JOIN times
                ON classificacao.time_id = times.id
        `;

        const valores = [];

        if (modalidade) {
            sql += ` WHERE times.modalidade = ?`;
            valores.push(modalidade);
        }

        sql += `
            ORDER BY classificacao.pontos DESC,
                     classificacao.vitorias DESC,
                     classificacao.saldo DESC,
                     times.nome ASC
        `;

        const [classificacao] = await db.query(sql, valores);

        return res.json(classificacao);

    } catch (erro) {
        console.error("Erro ao buscar classificação:", erro);

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
    console.log(
        "==================================\n" +
        " INTERHUB ONLINE\n" +
        " http://localhost:" + PORT + "\n" +
        "=================================="
    );

    try {
        const conexao = await db.getConnection();

        console.log("MySQL conectado com sucesso!");

        conexao.release();

    } catch (erro) {
        console.error("Erro ao conectar ao MySQL:", erro.message);
    }
});