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
// Limite de 50mb é fundamental para que as imagens em Base64 não deem erro 'Payload Too Large'
app.use(cors({
  origin: 'https://acade-me-frontend.vercel.app', // SEM a barra no final
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONEXÃO COM O MONGODB ---
mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log('🔥 MongoDB Conectado com Sucesso!'))
  .catch((err) => console.error('Erro ao conectar no Mongo:', err));

// --- ROTAS DE ALUNOS ---

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
    
    if (!student) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) return res.status(401).json({ error: 'Senha incorreta.' });

    const { password: _, ...userData } = student.toObject();
    res.json({ message: 'Login realizado com sucesso!', user: userData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// 3. Atualizar Perfil do Aluno (Bio, Curso, Foto)
app.put('/students/:id', async (req: Request, res: Response) => {
  try {
    const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedStudent) return res.status(404).json({ error: 'Aluno não encontrado.' });
    
    const { password, ...userData } = updatedStudent.toObject();
    res.json(userData);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar dados do perfil.' });
  }
});

// 4. Listar Alunos (Vitrine)
app.get('/students', async (req: Request, res: Response) => {
  try {
    const students = await Student.find().select('-password');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
});

// --- ROTAS DE PROJETOS ---

// 5. Criar Projeto
app.post('/projects', async (req: Request, res: Response) => {
  try {
    const project = await Project.create(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar projeto', details: error });
  }
});

// 6. Buscar DETALHES de um projeto (NECESSÁRIO PARA O EDITAR FUNCIONAR)
app.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projeto' });
  }
});

// 7. Atualizar Projeto (PUT)
app.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedProject) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar projeto' });
  }
});

// 8. Excluir Projeto (DELETE)
app.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const deletedProject = await Project.findByIdAndDelete(req.params.id);
    if (!deletedProject) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ message: 'Projeto excluído com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir projeto' });
  }
});

// 9. Listar Projetos de um Aluno Específico
app.get('/students/:id/projects', async (req: Request, res: Response) => {
  try {
    const projects = await Project.find({ student: req.params.id }).populate('student', 'name course');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projetos do aluno' });
  }
});

// Inicia o Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor AcadeMe rodando na porta ${PORT}`);
});