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

const countAcceptedMembers = (students: Array<{ status?: string }> = []) =>
  students.filter((item) => item.status === 'accepted').length;

const normalizeStudentId = (student: any) => {
  if (!student) return '';
  if (typeof student === 'string') return student;
  if (typeof student === 'object' && student._id) return student._id.toString();
  return student.toString();
};

const normalizeProfessorId = (professor: any) => {
  if (!professor) return '';
  if (typeof professor === 'string') return professor;
  if (typeof professor === 'object' && professor._id) return professor._id.toString();
  return professor.toString();
};

const populateProjectById = (projectId: string) =>
  Project.findById(projectId)
    .populate('students.student', 'name profileImage course')
    .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
    .populate('endorsements.professor', 'name profileImage academicTitle department');

const getViewerFromQuery = (req: Request) => {
  const viewerId = typeof req.query.viewerId === 'string' ? req.query.viewerId : '';
  const viewerRole = typeof req.query.viewerRole === 'string' ? req.query.viewerRole : '';

  return { viewerId, viewerRole };
};

const getProjectVisibilityFilter = (viewerId?: string, viewerRole?: string) => {
  const visibilityFilter: any[] = [{ "endorsements.0": { $exists: true } }];

  if (viewerId && viewerRole === 'student') {
    visibilityFilter.push({
      students: {
        $elemMatch: {
          student: viewerId,
          status: { $ne: 'declined' }
        }
      }
    });
  }

  if (viewerId && viewerRole === 'professor') {
    visibilityFilter.push({
      invitedProfessors: {
        $elemMatch: {
          professor: viewerId,
          status: { $ne: 'declined' }
        }
      }
    });
  }

  return { $or: visibilityFilter };
};

const canViewerAccessProject = (project: any, viewerId?: string, viewerRole?: string) => {
  if (project?.endorsements?.length > 0) return true;
  if (!viewerId) return false;

  if (viewerRole === 'student') {
    return project.students?.some((member: any) => (
      member.status !== 'declined' &&
      normalizeStudentId(member.student) === viewerId
    ));
  }

  if (viewerRole === 'professor') {
    return project.invitedProfessors?.some((invite: any) => {
      const professor = invite.professor;
      const professorId = typeof professor === 'object' && professor?._id
        ? professor._id.toString()
        : professor?.toString();

      return invite.status !== 'declined' && professorId === viewerId;
    });
  }

  return false;
};

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
    const { viewerId, viewerRole } = getViewerFromQuery(req);

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
      $and: [
        { $or: [{ title: searchRegex }, { tags: searchRegex }] },
        getProjectVisibilityFilter(viewerId, viewerRole)
      ]
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
    const { viewerId, viewerRole } = getViewerFromQuery(req);
    const projects = await Project.find({
      $and: [
        {
          students: {
            $elemMatch: { student: id, status: 'accepted' }
          }
        },
        getProjectVisibilityFilter(viewerId, viewerRole)
      ]
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
      { $match: { 'endorsements.0': { $exists: true } } },
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
app.get('/professors', async (req: Request, res: Response) => {
  try {
    const professors = await Professor.find().select('-password');
    res.json(professors);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar professores.' });
  }
});

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
app.get('/professors/:id/invites', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const invites = await Project.find({
      invitedProfessors: {
        $elemMatch: { professor: id, status: 'pending' }
      }
    })
      .populate('students.student', 'name profileImage course')
      .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
      .sort({ createdAt: -1 });

    res.json(invites);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar convites de validação.' });
  }
});

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
    const { viewerId, viewerRole } = getViewerFromQuery(req);
    const project = await Project.findById(req.params.id)
      .populate('students.student', 'name profileImage course')
      .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
      .populate('endorsements.professor', 'name profileImage academicTitle department');
      
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    if (!canViewerAccessProject(project, viewerId, viewerRole)) {
      return res.status(403).json({ error: 'Este projeto ainda aguarda validação docente.' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projeto' });
  }
});

// Atualizar Projeto
app.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const existingProject = await Project.findById(req.params.id);
    if (!existingProject) return res.status(404).json({ error: 'Projeto nÃ£o encontrado' });

    if (Array.isArray(req.body.students)) {
      const currentAcceptedMemberIds = existingProject.students
        .filter((member: any) => member.status === 'accepted')
        .map((member: any) => member.student.toString());

      const nextAcceptedMemberIds = req.body.students
        .filter((member: any) => member?.status === 'accepted')
        .map((member: any) => normalizeStudentId(member.student));

      const removedAcceptedMembers = currentAcceptedMemberIds.filter(
        (studentId) => !nextAcceptedMemberIds.includes(studentId)
      );

      if (removedAcceptedMembers.length > 0) {
        return res.status(400).json({
          error: 'Membros aceitos nao podem ser removidos pela edicao do projeto. Cada integrante deve sair pelo proprio projeto.'
        });
      }
    }

    if (Array.isArray(req.body.invitedProfessors)) {
      const currentProfessorIds = existingProject.invitedProfessors
        .map((invite: any) => invite.professor.toString());

      const nextProfessorIds = req.body.invitedProfessors
        .map((invite: any) => normalizeProfessorId(invite.professor))
        .filter(Boolean);

      const removedProfessorIds = currentProfessorIds.filter(
        (professorId) => !nextProfessorIds.includes(professorId)
      );

      if (removedProfessorIds.length > 0) {
        req.body.endorsements = existingProject.endorsements.filter(
          (endorsement: any) => !removedProfessorIds.includes(endorsement.professor.toString())
        );
      }
    }

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
    const project = await Project.findById(req.params.id);
    const deletedProject = project;

    if (deletedProject && countAcceptedMembers(deletedProject.students) > 1) {
      return res.status(400).json({
        error: 'Projetos com mais de um membro aceito nao podem ser excluidos. Os integrantes devem sair do projeto ate restar apenas uma pessoa.'
      });
    }

    if (deletedProject) {
      await Project.findByIdAndDelete(req.params.id);
    }
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

app.put('/projects/:projectId/respond-professor-invite', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { professorId, status } = req.body;

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const project = await Project.findOneAndUpdate(
      { _id: projectId, "invitedProfessors.professor": professorId },
      { $set: { "invitedProfessors.$.status": status } },
      { new: true }
    )
      .populate('students.student', 'name profileImage course')
      .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
      .populate('endorsements.professor', 'name profileImage academicTitle department');

    if (!project) return res.status(404).json({ error: 'Projeto ou convite não encontrado.' });
    res.json({ message: `Convite ${status === 'accepted' ? 'aceito' : 'recusado'}!`, project });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar resposta do convite docente.' });
  }
});

// Professor se desvincula do projeto, podendo manter ou remover sua validacao
app.put('/projects/:projectId/professor-leave', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { professorId, keepEndorsement } = req.body;

    if (!professorId) {
      return res.status(400).json({ error: 'Professor nao informado.' });
    }

    if (typeof keepEndorsement !== 'boolean') {
      return res.status(400).json({ error: 'Informe se a validacao deve ser mantida.' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Projeto nao encontrado.' });
    }

    const invitedProfessor = project.invitedProfessors.find(
      (invite: any) => invite.professor.toString() === professorId
    );

    if (!invitedProfessor) {
      return res.status(404).json({ error: 'Professor nao faz parte deste projeto.' });
    }

    project.invitedProfessors = project.invitedProfessors.filter(
      (invite: any) => invite.professor.toString() !== professorId
    ) as any;

    if (!keepEndorsement) {
      project.endorsements = project.endorsements.filter(
        (endorsement: any) => endorsement.professor.toString() !== professorId
      ) as any;
    }

    await project.save();

    const updatedProject = await populateProjectById(projectId.toString());
    res.json({
      message: keepEndorsement
        ? 'Voce saiu do projeto e manteve sua validacao.'
        : 'Voce saiu do projeto e removeu sua validacao.',
      project: updatedProject
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sair do projeto.' });
  }
});

// Aluno se desvincula da equipe de um projeto
app.put('/projects/:projectId/leave', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Aluno não informado.' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }

    const member = project.students.find(
      (item: any) => item.student.toString() === studentId
    );

    if (!member || member.status !== 'accepted') {
      return res.status(404).json({ error: 'Aluno não faz parte da equipe deste projeto.' });
    }

    const acceptedMembersCount = project.students.filter(
      (item: any) => item.status === 'accepted'
    ).length;

    if (acceptedMembersCount <= 1) {
      return res.status(400).json({ error: 'O último membro aceito não pode sair do projeto.' });
    }

    project.students = project.students.filter(
      (item: any) => item.student.toString() !== studentId
    ) as any;

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('students.student', 'name profileImage course')
      .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
      .populate('endorsements.professor', 'name profileImage academicTitle department');

    res.json({ message: 'Você saiu da equipe com sucesso.', project: updatedProject });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sair da equipe do projeto.' });
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
    const isInvitedProfessor = project.invitedProfessors?.some(
      (invite: any) => invite.professor.toString() === professorId && invite.status === 'accepted'
    );

    if (!isInvitedProfessor) {
      return res.status(403).json({ error: 'Apenas professores convidados e confirmados podem validar este projeto.' });
    }

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

    const updatedProject = await Project.findById(projectId)
      .populate('students.student', 'name profileImage course')
      .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
      .populate('endorsements.professor', 'name profileImage academicTitle department');

    res.json({ message: 'Projeto validado com sucesso!', project: updatedProject });
  } catch (error) {
    console.error('Erro ao validar projeto:', error);
    res.status(500).json({ error: 'Erro interno ao validar o projeto.' });
  }
});

// Vitrine: Listar apenas projetos que foram validados/chancelados por professores
app.get('/projects-endorsed', async (req: Request, res: Response) => {
  try {
    // Busca projetos onde o array de 'endorsements' tem tamanho maior que 0
    const endorsedProjects = await Project.find({ 
      "endorsements.0": { $exists: true } 
    })
    .populate('students.student', 'name profileImage course')
    .populate('endorsements.professor', 'name academicTitle') // Traz o nome do professor para exibir o crédito
    .sort({ createdAt: -1 }) // Traz os mais recentes primeiro
    .limit(6); // Limita a 6 projetos para a vitrine da Home não ficar gigante

    res.json(endorsedProjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar projetos chancelados' });
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

    const existingProject = await Project.findById(projectId);
    if (!existingProject) return res.status(404).json({ error: 'Projeto nao encontrado.' });

    const isActiveProfessor = existingProject.invitedProfessors.some(
      (invite: any) => invite.professor.toString() === professorId && invite.status === 'accepted'
    );

    if (!isActiveProfessor) {
      return res.status(403).json({ error: 'Apenas docentes ativos no projeto podem editar a validacao.' });
    }

    const project = await Project.findOneAndUpdate(
      { _id: projectId, "endorsements.professor": professorId },
      { $set: { "endorsements.$.comment": comment } },
      { new: true }
    )
      .populate('students.student', 'name profileImage course')
      .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
      .populate('endorsements.professor', 'name profileImage academicTitle department');

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

    const existingProject = await Project.findById(projectId);
    if (!existingProject) return res.status(404).json({ error: 'Projeto nao encontrado.' });

    const isActiveProfessor = existingProject.invitedProfessors.some(
      (invite: any) => invite.professor.toString() === professorId && invite.status === 'accepted'
    );

    if (!isActiveProfessor) {
      return res.status(403).json({ error: 'Apenas docentes ativos no projeto podem remover a validacao.' });
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      { $pull: { endorsements: { professor: professorId } } },
      { new: true }
    )
      .populate('students.student', 'name profileImage course')
      .populate('invitedProfessors.professor', 'name profileImage academicTitle department')
      .populate('endorsements.professor', 'name profileImage academicTitle department');

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
