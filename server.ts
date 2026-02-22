import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Importando os Modelos
import Student from './models/Student';
import Project from './models/Project';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
// Aumentamos o limite do JSON para suportar o envio de imagens em Base64
app.use(cors()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONEXÃO COM O MONGODB ---
mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log('🔥 MongoDB Conectado com Sucesso!'))
  .catch((err) => console.error('Erro ao conectar no Mongo:', err));

// --- ROTAS (ENDPOINTS) ---

// Rota de Teste
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'API do AcadeMe está online!' });
});

// 1. Cadastro de Aluno (Signup)
app.post('/students', async (req: Request, res: Response) => {
  try {
    const student = await Student.create(req.body);
    const { password, ...studentWithoutPassword } = student.toObject();
    res.status(201).json(studentWithoutPassword);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar aluno. Verifique se o e-mail já existe.' });
  }
});

// 2. Login de Aluno
app.post('/students/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const student = await Student.findOne({ email });
    if (!student) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    const { password: _, ...userData } = student.toObject();
    res.json({ message: 'Login realizado com sucesso!', user: userData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// 3. ATUALIZAR PERFIL (Incluindo Imagem de Perfil)
app.put('/students/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // O findByIdAndUpdate com { new: true } retorna o documento já atualizado
    const updatedStudent = await Student.findByIdAndUpdate(id, req.body, { new: true });
    
    if (!updatedStudent) {
      return res.status(404).json({ error: 'Aluno não encontrado.' });
    }

    const { password, ...userData } = updatedStudent.toObject();
    res.json(userData);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar dados do perfil.' });
  }
});

// 4. Listar todos os Alunos (Vitrine)
app.get('/students', async (req: Request, res: Response) => {
  try {
    const students = await Student.find().select('-password');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
});

// 5. Adicionar um Projeto para um Aluno
app.post('/projects', async (req: Request, res: Response) => {
  try {
    const project = await Project.create(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar projeto', details: error });
  }
});

// 6. Listar Projetos de um Aluno Específico
app.get('/students/:id/projects', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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