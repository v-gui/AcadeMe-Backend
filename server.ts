import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Importando os Modelos
import Student from './models/Student';
import Project from './models/Project';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors()); // Permite que o Frontend acesse o Backend
app.use(express.json()); // Permite ler JSON no corpo das requisições

// --- CONEXÃO COM O MONGODB ---
mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log('🔥 MongoDB Conectado com Sucesso!'))
  .catch((err) => console.error('Erro ao conectar no Mongo:', err));

// --- ROTAS (ENDPOINTS) ---

// Rota de Teste
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'API do AcadeMe está online!' });
});

// 1. Criar um Aluno (Cadastro)
app.post('/students', async (req: Request, res: Response) => {
  try {
    const student = await Student.create(req.body);
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar aluno', details: error });
  }
});

// 2. Listar todos os Alunos (Vitrine)
app.get('/students', async (req: Request, res: Response) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
});

// 3. Adicionar um Projeto para um Aluno
app.post('/projects', async (req: Request, res: Response) => {
  try {
    // O body deve conter: { title, description, student: "ID_DO_ALUNO", ... }
    const project = await Project.create(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar projeto', details: error });
  }
});

// 4. Listar Projetos de um Aluno Específico
app.get('/students/:id/projects', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Busca projetos onde o campo 'student' é igual ao ID passado
    const projects = await Project.find({ student: id }).populate('student', 'name course');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projetos do aluno' });
  }
});

// Inicia o Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});