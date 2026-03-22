import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Importando os Modelos BD
import Student from './models/Student';
import Project from './models/Project';
import Professor from './models/Professor';

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


// ==========================================
// --- ROTA DE BUSCA GLOBAL (Alunos, Projetos e Professores) ---
// ==========================================
app.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.json({ students: [], projects: [], professors: [] });
    }

    const searchRegex = new RegExp(q, 'i');

    const studentsPromise = Student.find({
      $or: [{ name: searchRegex }, { course: searchRegex }]
    }).select('-password').limit(5);

    const professorsPromise = Professor.find({
      $or: [{ name: searchRegex }, { department: searchRegex }]
    }).select('-password').limit(5);

    const projectsPromise = Project.find({
      $or: [{ title: searchRegex }, { tags: searchRegex }]
    }).populate('students.student', 'name profileImage').limit(5);

    // Dispara as 3 buscas simultaneamente
    const [students, professors, projects] = await Promise.all([
      studentsPromise, 
      professorsPromise, 
      projectsPromise
    ]);

    res.json({ students, professors, projects });

  } catch (error) {
    console.error('Erro na busca global:', error);
    res.status(500).json({ error: 'Erro ao realizar a busca.' });
  }
});


// ==========================================
// --- ROTAS DE ALUNOS ---
// ==========================================

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

// ==========================================
// --- ROTAS DE PROFESSORES ---
// ==========================================

// 1. Cadastro de Professor
app.post('/professors', async (req: Request, res: Response) => {
  try {
    // O Mongoose já vai rodar o 'pre-save' que criamos no ProfessorSchema para hashear a senha
    const professor = await Professor.create(req.body);
    
    // Removemos a senha antes de devolver os dados para o frontend
    const { password, ...profWithoutPassword } = professor.toObject();
    
    res.status(201).json(profWithoutPassword);
  } catch (error) {
    console.error('Erro no cadastro de professor:', error);
    res.status(400).json({ error: 'Erro ao cadastrar professor. O e-mail já pode estar em uso.' });
  }
});

// 2. Login de Professor
app.post('/professors/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Busca o professor pelo email
    const professor = await Professor.findOne({ email });
    if (!professor) {
      return res.status(404).json({ error: 'Professor não encontrado com este e-mail.' });
    }

    // Compara a senha digitada com o hash salvo no banco
    const isMatch = await bcrypt.compare(password, professor.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // Remove a senha do objeto de resposta
    const { password: _, ...userData } = professor.toObject();
    
    // role: 'professor'
    res.json({ 
      message: 'Login realizado com sucesso!', 
      user: { ...userData, role: 'professor' } 
    });
  } catch (error) {
    console.error('Erro no login de professor:', error);
    res.status(500).json({ error: 'Erro interno no servidor ao realizar login.' });
  }
});

// 3. Buscar Dados do Perfil do Professor
app.get('/professors/:id', async (req: Request, res: Response) => {
  try {
    const professor = await Professor.findById(req.params.id).select('-password');
    if (!professor) {
      return res.status(404).json({ error: 'Professor não encontrado.' });
    }
    res.json(professor);
  } catch (error) {
    console.error('Erro ao buscar professor:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do perfil do professor.' });
  }
});

// 4. Atualizar Perfil do Professor
app.put('/professors/:id', async (req: Request, res: Response) => {
  try {
    const updatedProfessor = await Professor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedProfessor) {
      return res.status(404).json({ error: 'Professor não encontrado.' });
    }
    
    const { password, ...userData } = updatedProfessor.toObject();
    res.json(userData);
  } catch (error) {
    console.error('Erro ao atualizar professor:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados do perfil.' });
  }
});

// ==========================================
// --- ROTAS DE PROJETOS ---
// ==========================================

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
    const project = await Project.findById(req.params.id).populate('students.student', 'name profileImage course', ).populate('endorsements.professor', 'name profileImage academicTitle department');;
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
        $elemMatch: { student: id, status: 'accepted' } 
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

// 11. Verificar se o Aluno tem Projetos Ativos
app.get('/students-active', async (req: Request, res: Response) => {
  try {
    const result = await Project.aggregate([
      { $unwind: '$students' }, 
      { $match: { 'students.status': 'accepted' } }, 
      { $group: { _id: '$students.student' } } 
    ]);

    const activeStudentIds = result.map(item => item._id);

    const activeStudents = await Student.find({ 
      _id: { $in: activeStudentIds } 
    }).select('-password');

    res.json(activeStudents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar talentos ativos' });
  }
});

// ==========================================
// --- VALIDAR / ENDOSSAR PROJETO (PROFESSORES) ---
// ==========================================
app.post('/projects/:projectId/endorse', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { professorId, comment } = req.body;

    // 1. Verifica se o projeto existe
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }

    // 2. Regra de Negócio: O professor não pode validar o mesmo projeto duas vezes
    const alreadyEndorsed = project.endorsements.some(
      (end) => end.professor.toString() === professorId
    );

    if (alreadyEndorsed) {
      return res.status(400).json({ error: 'Você já validou este projeto anteriormente.' });
    }

    // 3. Adiciona a validação ao array
    project.endorsements.push({
      professor: professorId,
      comment: comment || '',
      endorsedAt: new Date()
    });

    await project.save();

    res.json({ message: 'Projeto validado com sucesso!', project });
  } catch (error) {
    console.error('Erro ao validar projeto:', error);
    res.status(500).json({ error: 'Erro interno ao validar o projeto.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor AcadeMe rodando na porta ${PORT}`);
});