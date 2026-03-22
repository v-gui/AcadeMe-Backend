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

// Lista de sites permitidos a se conectar com nosso backend
const allowedOrigins = [
  'http://localhost:3000',
  'https://acade-me-frontend.vercel.app'
];

// --- MIDDLEWARES ---
// Permite que o frontend (React) converse com o backend sem erros de CORS
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
// Aumenta o limite de tamanho para permitir envio de imagens em Base64
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONEXÃO COM O MONGODB ---
mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log('🔥 MongoDB Conectado com Sucesso!'))
  .catch((err) => console.error('Erro ao conectar no Mongo:', err));


// ==========================================
// --- ROTA UNIVERSAL DE LOGIN (ALUNOS E PROFESSORES) ---
// ==========================================
// Esta rota verifica se o e-mail pertence a um aluno ou a um professor
app.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // 1. Tenta achar na coleção de Alunos
    let user: any = await Student.findOne({ email });
    let role = 'student';

    // 2. Se não for aluno, tenta achar na coleção de Professores
    if (!user) {
      user = await Professor.findOne({ email });
      role = 'professor';
    }

    // 3. Se não achar em lugar nenhum, barra o acesso
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // 4. Verifica se a senha está correta
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // 5. Remove a senha dos dados e devolve para o Frontend, incluindo a 'role'
    const { password: _, ...userData } = user.toObject();
    res.json({ 
      message: 'Login realizado com sucesso!', 
      user: { ...userData, role } 
    });

  } catch (error) {
    console.error('Erro no login universal:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});


// ==========================================
// --- ROTA DE BUSCA GLOBAL (ALUNOS, PROFESSORES E PROJETOS) ---
// ==========================================
// Recebe um termo digitado e procura nas 3 coleções ao mesmo tempo
app.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    // Se o termo for vazio, não faz a busca
    if (!q || typeof q !== 'string') {
      return res.json({ students: [], projects: [], professors: [] });
    }

    // Ignora letras maiúsculas/minúsculas na pesquisa
    const searchRegex = new RegExp(q, 'i');

    // Monta as promessas de busca (Limitadas a 5 para não pesar o frontend)
    const studentsPromise = Student.find({
      $or: [{ name: searchRegex }, { course: searchRegex }]
    }).select('-password').limit(5);

    const professorsPromise = Professor.find({
      $or: [{ name: searchRegex }, { department: searchRegex }]
    }).select('-password').limit(5);

    const projectsPromise = Project.find({
      $or: [{ title: searchRegex }, { tags: searchRegex }]
    }).populate('students.student', 'name profileImage').limit(5);

    // Dispara todas as buscas ao mesmo tempo para ser mais rápido
    const [students, professors, projects] = await Promise.all([
      studentsPromise, 
      professorsPromise, 
      projectsPromise
    ]);

    // Retorna tudo agrupadinho
    res.json({ students, professors, projects });

  } catch (error) {
    console.error('Erro na busca global:', error);
    res.status(500).json({ error: 'Erro ao realizar a busca.' });
  }
});


// ==========================================
// --- ROTAS DE ALUNOS ---
// ==========================================

// Criar Aluno (Cadastro)
app.post('/students', async (req: Request, res: Response) => {
  try {
    const student = await Student.create(req.body);
    const { password, ...studentWithoutPassword } = student.toObject();
    res.status(201).json(studentWithoutPassword);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar aluno. Verifique se o e-mail já existe.' });
  }
});

// Atualizar Aluno
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

// Listar todos os Alunos
app.get('/students', async (req: Request, res: Response) => {
  try {
    const students = await Student.find().select('-password');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
});

// Buscar um Aluno Específico
app.get('/students/:id', async (req: Request, res: Response) => {
  try {
    const student = await Student.findById(req.params.id).select('-password');
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar dados do perfil do aluno.' });
  }
});

// Listar Projetos Aceitos de um Aluno Específico
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

// Buscar Convites de Projetos Pendentes do Aluno
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

// Vitrine: Listar apenas Alunos que já têm projetos aceitos
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
// --- ROTAS DE PROFESSORES ---
// ==========================================

// Criar Professor (Cadastro)
app.post('/professors', async (req: Request, res: Response) => {
  try {
    const professor = await Professor.create(req.body);
    const { password, ...profWithoutPassword } = professor.toObject();
    res.status(201).json(profWithoutPassword);
  } catch (error) {
    console.error('Erro no cadastro de professor:', error);
    res.status(400).json({ error: 'Erro ao cadastrar professor. O e-mail já pode estar em uso.' });
  }
});

// Buscar um Professor Específico
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

// Atualizar Professor
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

// Criar novo Projeto
app.post('/projects', async (req: Request, res: Response) => {
  try {
    const project = await Project.create(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar projeto', details: error });
  }
});

// Buscar Projeto Específico (Popula os Alunos e os Professores que endossaram)
app.get('/projects/:id', async (req: Request, res: Response) => {
  try {   
    const project = await Project.findById(req.params.id)
      .populate('students.student', 'name profileImage course')
      .populate('endorsements.professor', 'name profileImage academicTitle department');
      
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projeto' });
  }
});

// Atualizar Projeto
app.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedProject) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar projeto' });
  }
});

// Excluir Projeto
app.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const deletedProject = await Project.findByIdAndDelete(req.params.id);
    if (!deletedProject) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ message: 'Projeto excluído com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir projeto' });
  }
});

// Resposta ao Convite do Projeto (Aluno Aceita ou Recusa)
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

// Validar / Endossar Projeto (Ação exclusiva de Professor)
app.post('/projects/:projectId/endorse', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { professorId, comment } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }

    // Regra: Professor não pode validar o mesmo projeto mais de uma vez
    const alreadyEndorsed = project.endorsements.some(
      (end: any) => end.professor.toString() === professorId
    );

    if (alreadyEndorsed) {
      return res.status(400).json({ error: 'Você já validou este projeto anteriormente.' });
    }

    // Adiciona o selo de validação
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

// ==========================================
// --- GERENCIAMENTO DE CHANCELAS (PROFESSORES) ---
// ==========================================

// 1. Buscar todos os projetos que um professor validou (Para o ProfileProf)
app.get('/professors/:id/projects', async (req: Request, res: Response) => {
  try {
    const projects = await Project.find({ "endorsements.professor": req.params.id })
      .populate('students.student', 'name course profileImage');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projetos validados.' });
  }
});

// 2. Editar o comentário da validação
app.put('/projects/:projectId/endorse/:professorId', async (req: Request, res: Response) => {
  try {
    const { projectId, professorId } = req.params;
    const { comment } = req.body;

    const project = await Project.findOneAndUpdate(
      { _id: projectId, "endorsements.professor": professorId },
      { $set: { "endorsements.$.comment": comment } },
      { new: true }
    ).populate('endorsements.professor', 'name profileImage academicTitle department');

    if (!project) return res.status(404).json({ error: 'Validação não encontrada.' });
    res.json({ message: 'Parecer atualizado com sucesso!', project });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar parecer.' });
  }
});

// 3. Remover a validação (Excluir)
app.delete('/projects/:projectId/endorse/:professorId', async (req: Request, res: Response) => {
  try {
    const { projectId, professorId } = req.params;

    const project = await Project.findByIdAndUpdate(
      projectId,
      { $pull: { endorsements: { professor: professorId } } },
      { new: true }
    ).populate('endorsements.professor', 'name profileImage academicTitle department');

    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
    res.json({ message: 'Chancelamento removido com sucesso!', project });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover validação.' });
  }
});

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`🚀 Servidor AcadeMe rodando na porta ${PORT}`);
});