const express = require('express');
const multer = require('multer');
const exceltoJson = require('convert-excel-to-json');
const cors = require('cors');
const mysql = require('mysql2');
const fs = require('fs-extra');

const app = express();
const port = 3000;

// Habilitar CORS para requisições de diferentes origens
app.use(cors());
app.use(express.json());  // Permitir envio de JSON no corpo das requisições

// Configuração do Multer para upload de arquivos
var upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }  // Limite de 5MB
});

// Conexão com o banco de dados (usando pool)
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '123321',
  database: 'safe',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Função para inserir dados do Excel no banco de dados
async function insertDataToDatabase(data) {
  const query = `
    INSERT INTO safe (matricula, nome, status) 
    VALUES (?, ?, ?) 
    ON DUPLICATE KEY UPDATE nome = VALUES(nome), status = VALUES(status)`;

  return new Promise((resolve, reject) => {
    pool.query(query, data, (err, result) => {
      if (err) {
        console.error('Erro ao inserir no banco de dados:', err);
        return reject(err);
      }
      resolve(result);
    });
  });
}

// -------------------
// CRUD Completo (API)
// -------------------

// 1. Listar todos os registros (GET)
app.get('/api/matriculas', (req, res) => {
  pool.query('SELECT * FROM safe', (err, results) => {
    if (err) {
      res.status(500).send('Erro ao buscar registros');
      return;
    }
    res.json(results);
  });
});

// 2. Buscar um registro por ID (GET)
app.get('/api/matriculas/:id', (req, res) => {
  const { id } = req.params;
  pool.query('SELECT * FROM safe WHERE id = ?', [id], (err, results) => {
    if (err) {
      res.status(500).send('Erro ao buscar o registro');
      return;
    }
    if (results.length === 0) {
      res.status(404).send('Registro não encontrado');
      return;
    }
    res.json(results[0]);
  });
});

// 3. Criar novo registro (POST)
app.post('/api/matriculas', (req, res) => {
  const { matricula, nome, status } = req.body;

  if (!matricula || !nome || !status) {
    res.status(400).send('Preencha todos os campos');
    return;
  }

  const sql = 'INSERT INTO safe (matricula, nome, status) VALUES (?, ?, ?)';
  pool.query(sql, [matricula, nome, status], (err, result) => {
    if (err) {
      res.status(500).send('Erro ao adicionar registro');
      return;
    }
    res.status(201).send('Registro adicionado com sucesso');
  });
});

// 4. Atualizar registro (PUT)
app.put('/api/matriculas/:id', (req, res) => {
  const { id } = req.params;
  const { matricula, nome, status } = req.body;

  if (!matricula || !nome || !status) {
    res.status(400).send('Preencha todos os campos');
    return;
  }

  const sql = 'UPDATE safe SET matricula = ?, nome = ?, status = ? WHERE id = ?';
  pool.query(sql, [matricula, nome, status, id], (err, result) => {
    if (err) {
      res.status(500).send('Erro ao atualizar registro');
      return;
    }
    res.send('Registro atualizado com sucesso');
  });
});

// 5. Deletar registro (DELETE)
app.delete('/api/matriculas/:id', (req, res) => {
  const { id } = req.params;

  pool.query('DELETE FROM safe WHERE id = ?', [id], (err, result) => {
    if (err) {
      res.status(500).send('Erro ao excluir registro');
      return;
    }
    res.send('Registro excluído com sucesso');
  });
});

// -----------------------
// Upload de Excel (POST)
// -----------------------
app.post('/read', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhum arquivo foi enviado' });
  }

  const filePath = 'uploads/' + req.file.filename;

  try {
    const excelData = exceltoJson({
      sourceFile: filePath,
      header: { rows: 1 },
      columnToKey: { '*': '{{columnHeader}}' },
    });

    if (!excelData['Folha1'] || excelData['Folha1'].length === 0) {
      return res.status(400).json({ message: 'Arquivo Excel inválido' });
    }

    const insertPromises = excelData['Folha1'].map(async (row) => {
      if (row.matricula && row.nome && row.status) {
        const values = [row.matricula, row.nome, row.status];
        await insertDataToDatabase(values);
      }
    });

    await Promise.all(insertPromises);
    res.status(200).json({ message: 'Dados importados com sucesso' });

  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
    res.status(500).json({ error: 'Erro ao processar arquivo' });
  } finally {
    fs.remove(filePath).catch((err) => console.error('Erro ao remover arquivo:', err));
  }
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

// Encerrar pool de conexões ao parar servidor
process.on('SIGINT', () => {
  pool.end(() => {
    console.log('Conexões encerradas.');
    process.exit(0);
  });
});
