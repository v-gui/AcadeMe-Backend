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
const allowedOrigins = [
  'http://localhost:3000',
  'https://acade-me-frontend.vercel.app'
];

// Middlewares
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONEXÃO COM O MONGODB ---
mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log('🔥 MongoDB Conectado com Sucesso!'))
  .catch((err) => console.error('Erro ao conectar no Mongo:', err));

// --- ROTAS DE ALUNOS ---

app.post('/students', async (req: Request, res: Response) => {
  try {
    const student = await Student.create(req.body);
    const { password, ...studentWithoutPassword } = student.toObject();
    res.status(201).json(studentWithoutPassword);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar aluno. Verifique se o e-mail já existe.' });
  }
});

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

app.get('/students', async (req: Request, res: Response) => {
  try {
    const students = await Student.find().select('-password');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
});

app.get('/students/:id', async (req: Request, res: Response) => {
  try {
    const student = await Student.findById(req.params.id).select('-password');
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar dados do perfil do aluno.' });
  }
});

// --- ROTAS DE PROJETOS ---

app.post('/projects', async (req: Request, res: Response) => {
  try {
    const project = await Project.create(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar projeto', details: error });
  }
});

app.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    // AJUSTE: Como students é um array de objetos {student, status}, o populate deve ser assim:
    const project = await Project.findById(req.params.id).populate('students.student', 'name profileImage course');
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projeto' });
  }
});

app.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedProject) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar projeto' });
  }
});

app.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const deletedProject = await Project.findByIdAndDelete(req.params.id);
    if (!deletedProject) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ message: 'Projeto excluído com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir projeto' });
  }
});

// Resposta ao Convite
app.put('/projects/:projectId/respond-invite', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { studentId, status } = req.body;

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const project = await Project.findOneAndUpdate(
      { _id: projectId, "students.student": studentId },
      { $set: { "students.$.status": status } },
      { new: true }
    );

    if (!project) return res.status(404).json({ error: 'Projeto ou convite não encontrado.' });

    res.json({ message: `Convite ${status === 'accepted' ? 'aceito' : 'recusado'}!`, project });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar resposta do convite.' });
  }
});

// 9. LISTAR PROJETOS ACEITOS DO ALUNO
app.get('/students/:id/projects', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;    
    const projects = await Project.find({
      students: { 
        $elemMatch: { student: id, status: 'accepted' } // CORREÇÃO: de 'aceito' para 'accepted'
      }
    }).populate('students.student', 'name course profileImage');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projetos do aluno' });
  }
});

// 10. Buscar Convites Pendentes
app.get('/students/:id/invites', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const invites = await Project.find({
      students: { 
        $elemMatch: { student: id, status: 'pending' } 
      }
    })
    .populate('students.student', 'name profileImage course')
    .sort({ createdAt: -1 });

    res.json(invites);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar convites pendentes.' });
  }
});

//11. Verificar se o Aluno tem Projetos Ativos
app.get('/students-active', async (req: Request, res: Response) => {
  try {
    const activeStudentIds = await Project.distinct('students.student', { 
      'students.status': 'accepted' 
    });
    const activeStudents = await Student.find({ 
      _id: { $in: activeStudentIds } 
    }).select('-password');
    res.json(activeStudents);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar talentos ativos' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor AcadeMe rodando na porta ${PORT}`);
});