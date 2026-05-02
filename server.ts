import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';


import Student from './models/Student';
import Project from './models/Project';
import Professor from './models/Professor';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const TOKEN_EXPIRATION_MS = 1000 * 60 * 60 * 24;
const RESET_TOKEN_EXPIRATION_MS = 1000 * 60 * 30;
const privateUserFields = '-password -emailVerificationToken -emailVerificationExpires -resetPasswordToken -resetPasswordExpires';

const getBaseAppUrl = () => FRONTEND_URL.replace(/\/$/, '');

const createToken = () => crypto.randomBytes(32).toString('hex');

const sanitizeUser = (user: any, role: string) => {
  const {
    password: _password,
    emailVerificationToken: _emailVerificationToken,
    emailVerificationExpires: _emailVerificationExpires,
    resetPasswordToken: _resetPasswordToken,
    resetPasswordExpires: _resetPasswordExpires,
    ...userData
  } = user.toObject();

  return { ...userData, role };
};

const createMailTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP não configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

const sendEmail = async (to: string, subject: string, html: string) => {
  const transporter = createMailTransport();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to,
    subject,
    html
  });
};

const buildEmailShell = (title: string, message: string, ctaLabel: string, ctaUrl: string) => `
  <div style="font-family: Arial, sans-serif; background: #f4f8fc; padding: 32px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 32px; border: 1px solid #e6eef8;">
      <div style="margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #006acb;">AcadeMe</div>
        <h1 style="margin: 12px 0 0; color: #003465;">${title}</h1>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #35516f;">${message}</p>
      <div style="text-align: center; margin-top: 24px;">
        <a href="${ctaUrl}" style="display: inline-block; background: linear-gradient(135deg, #006acb, #003465); color: #ffffff; text-decoration: none; font-weight: 700; padding: 14px 22px; border-radius: 999px;">
          ${ctaLabel}
        </a>
      </div>
      <p style="margin-top: 24px; font-size: 12px; line-height: 1.6; color: #6c8299;">Se o botão não funcionar, copie e cole este link no navegador:<br />${ctaUrl}</p>
    </div>
  </div>
`;

const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${getBaseAppUrl()}/verify-email?token=${token}`;
  const html = buildEmailShell(
    'Confirme sua conta',
    'Para concluir seu cadastro no AcadeMe, confirme seu e-mail pelo botão abaixo.',
    'Confirmar e-mail',
    verificationUrl
  );

  await sendEmail(email, 'Confirme seu cadastro no AcadeMe', html);
};

const sendResetPasswordEmail = async (email: string, token: string) => {
  const resetUrl = `${getBaseAppUrl()}/reset-password?token=${token}`;
  const html = buildEmailShell(
    'Redefina sua senha',
    'Recebemos uma solicitação para alterar sua senha. Se foi você, use o botão abaixo.',
    'Criar nova senha',
    resetUrl
  );

  await sendEmail(email, 'Redefinição de senha no AcadeMe', html);
};

const findAuthUserByEmail = async (email: string) => {
  let user: any = await Student.findOne({ email });
  let role = 'student';

  if (!user) {
    user = await Professor.findOne({ email });
    role = 'professor';
  }

  return { user, role };
};

const findAuthUserByVerificationToken = async (token: string) => {
  const query = {
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: new Date() }
  };

  let user: any = await Student.findOne(query);
  let role = 'student';

  if (!user) {
    user = await Professor.findOne(query);
    role = 'professor';
  }

  return { user, role };
};

const findAuthUserByResetToken = async (token: string) => {
  const query = {
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: new Date() }
  };

  let user: any = await Student.findOne(query);
  let role = 'student';

  if (!user) {
    user = await Professor.findOne(query);
    role = 'professor';
  }

  return { user, role };
};

const countAcceptedMembers = (students: Array<{ status?: string }> = []) =>
  students.filter((item) => item.status === 'accepted').length;

const getStudentIdFromMember = (member: any) => normalizeStudentId(member?.student);

const getFirstAcceptedStudentId = (students: Array<{ student?: any; status?: string }> = []) =>
  students.find((item) => item.status === 'accepted' && getStudentIdFromMember(item))?.student;

const getProjectAdminId = (project: any) => {
  if (project?.adminStudent) return normalizeStudentId(project.adminStudent);
  const firstAcceptedStudent = getFirstAcceptedStudentId(project?.students || []);
  return normalizeStudentId(firstAcceptedStudent);
};

const isProjectAdmin = (project: any, studentId?: string) =>
  Boolean(studentId && getProjectAdminId(project) === studentId);

const isAcceptedProjectMemberById = (project: any, studentId?: string) =>
  Boolean(
    studentId &&
    project?.students?.some(
      (member: any) => member.status === 'accepted' && normalizeStudentId(member.student) === studentId
    )
  );

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
    .populate('adminStudent', 'name profileImage course')
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


const allowedOrigins = [
  'http://localhost:3000',
  'https://acade-me-frontend.vercel.app'
];



app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const shadowAuthRoutes = () => {
  app.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const { user, role } = await findAuthUserByEmail(email);

      if (!user) {
        return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado.' });
      }

      if (!user.emailVerified) {
        return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar na plataforma.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

      return res.json({
        message: 'Login realizado com sucesso!',
        user: sanitizeUser(user, role)
      });
    } catch (error) {
      console.error('Erro no login universal:', error);
      return res.status(500).json({ error: 'Erro interno no servidor' });
    }
  });

  app.get('/auth/verify-email', async (req: Request, res: Response) => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';

      if (!token) {
        return res.status(400).json({ error: 'Token de verificação inválido.' });
      }

      const { user } = await findAuthUserByVerificationToken(token);

      if (!user) {
        return res.status(400).json({ error: 'Token de verificação inválido ou expirado.' });
      }

      user.emailVerified = true;
      user.emailVerificationToken = null;
      user.emailVerificationExpires = null;
      await user.save();

      return res.json({ message: 'E-mail confirmado com sucesso.' });
    } catch (error) {
      console.error('Erro ao confirmar e-mail:', error);
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  });

  app.post('/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Informe um e-mail para continuar.' });
      }

      const { user } = await findAuthUserByEmail(email);

      if (user) {
        user.resetPasswordToken = createToken();
        user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRATION_MS);
        await user.save();
        await sendResetPasswordEmail(email, user.resetPasswordToken);
      }

      return res.json({
        message: 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.'
      });
    } catch (error) {
      console.error('Erro ao solicitar redefinição de senha:', error);
      return res.status(500).json({ error: 'Não foi possível enviar o e-mail de redefinição.' });
    }
  });

  app.post('/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
      }

      const { user } = await findAuthUserByResetToken(token);

      if (!user) {
        return res.status(400).json({ error: 'Token de redefinição inválido ou expirado.' });
      }

      user.password = password;
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();

      return res.json({ message: 'Senha atualizada com sucesso.' });
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      return res.status(500).json({ error: 'Não foi possível redefinir a senha.' });
    }
  });

  app.get('/search', async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      const { viewerId, viewerRole } = getViewerFromQuery(req);

      if (!q || typeof q !== 'string') {
        return res.json({ students: [], projects: [], professors: [] });
      }

      const searchRegex = new RegExp(q, 'i');

      const studentsPromise = Student.find({
        $or: [{ name: searchRegex }, { course: searchRegex }]
      }).select(privateUserFields).limit(5);

      const professorsPromise = Professor.find({
        $or: [{ name: searchRegex }, { department: searchRegex }]
      }).select(privateUserFields).limit(5);

      const projectsPromise = Project.find({
        $and: [
          { $or: [{ title: searchRegex }, { tags: searchRegex }] },
          getProjectVisibilityFilter(viewerId, viewerRole)
        ]
      }).populate('students.student', 'name profileImage').limit(5);

      const [students, professors, projects] = await Promise.all([
        studentsPromise,
        professorsPromise,
        projectsPromise
      ]);

      return res.json({ students, professors, projects });
    } catch (error) {
      console.error('Erro na busca global:', error);
      return res.status(500).json({ error: 'Erro ao realizar a busca.' });
    }
  });

  app.post('/students', async (req: Request, res: Response) => {
    try {
      const verificationToken = createToken();
      const student = new Student({
        ...req.body,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + TOKEN_EXPIRATION_MS)
      });

      await student.save();

      try {
        await sendVerificationEmail(student.email, verificationToken);
      } catch (error) {
        await Student.findByIdAndDelete(student._id);
        throw error;
      }

      return res.status(201).json({
        message: 'Cadastro criado. Enviamos um e-mail de confirmação para ativar sua conta.'
      });
    } catch (error) {
      console.error('Erro ao criar aluno:', error);
      return res.status(400).json({ error: 'Erro ao criar aluno. Verifique se o e-mail já existe ou se o SMTP foi configurado.' });
    }
  });

  app.put('/students/:id', async (req: Request, res: Response) => {
    try {
      const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updatedStudent) return res.status(404).json({ error: 'Aluno nÃ£o encontrado.' });
      return res.json(sanitizeUser(updatedStudent, 'student'));
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar dados do perfil.' });
    }
  });

  app.get('/students', async (_req: Request, res: Response) => {
    try {
      const students = await Student.find().select(privateUserFields);
      return res.json(students);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar alunos' });
    }
  });

  app.get('/students/:id', async (req: Request, res: Response) => {
    try {
      const student = await Student.findById(req.params.id).select(privateUserFields);
      if (!student) return res.status(404).json({ error: 'Aluno nÃ£o encontrado.' });
      return res.json(student);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar dados do perfil do aluno.' });
    }
  });

  app.get('/students-active', async (_req: Request, res: Response) => {
    try {
      const result = await Project.aggregate([
        { $match: { 'endorsements.0': { $exists: true } } },
        { $unwind: '$students' },
        { $match: { 'students.status': 'accepted' } },
        { $group: { _id: '$students.student' } }
      ]);

      const activeStudentIds = result.map(item => item._id);
      const activeStudents = await Student.find({ _id: { $in: activeStudentIds } }).select(privateUserFields);

      return res.json(activeStudents);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar talentos ativos' });
    }
  });

  app.post('/professors', async (req: Request, res: Response) => {
    try {
      const verificationToken = createToken();
      const professor = new Professor({
        ...req.body,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + TOKEN_EXPIRATION_MS)
      });

      await professor.save();

      try {
        await sendVerificationEmail(professor.email, verificationToken);
      } catch (error) {
        await Professor.findByIdAndDelete(professor._id);
        throw error;
      }

      return res.status(201).json({
        message: 'Cadastro criado. Enviamos um e-mail de confirmação para ativar sua conta.'
      });
    } catch (error) {
      console.error('Erro no cadastro de professor:', error);
      return res.status(400).json({ error: 'Erro ao cadastrar professor. Verifique o e-mail informado e a configuração do SMTP.' });
    }
  });

  app.get('/professors', async (_req: Request, res: Response) => {
    try {
      const professors = await Professor.find().select(privateUserFields);
      return res.json(professors);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar professores.' });
    }
  });

  app.get('/professors/:id', async (req: Request, res: Response) => {
    try {
      const professor = await Professor.findById(req.params.id).select(privateUserFields);
      if (!professor) {
        return res.status(404).json({ error: 'Professor nÃ£o encontrado.' });
      }
      return res.json(professor);
    } catch (error) {
      console.error('Erro ao buscar professor:', error);
      return res.status(500).json({ error: 'Erro ao buscar dados do perfil do professor.' });
    }
  });

  app.put('/professors/:id', async (req: Request, res: Response) => {
    try {
      const updatedProfessor = await Professor.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updatedProfessor) {
        return res.status(404).json({ error: 'Professor nÃ£o encontrado.' });
      }
      return res.json(sanitizeUser(updatedProfessor, 'professor'));
    } catch (error) {
      console.error('Erro ao atualizar professor:', error);
      return res.status(500).json({ error: 'Erro ao atualizar dados do perfil.' });
    }
  });
};

shadowAuthRoutes();


mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log('🔥 MongoDB Conectado com Sucesso!'))
  .catch((err) => console.error('Erro ao conectar no Mongo:', err));






app.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    

    let user: any = await Student.findOne({ email });
    let role = 'student';


    if (!user) {
      user = await Professor.findOne({ email });
      role = 'professor';
    }


    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }


    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }


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






app.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    const { viewerId, viewerRole } = getViewerFromQuery(req);

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
      $and: [
        { $or: [{ title: searchRegex }, { tags: searchRegex }] },
        getProjectVisibilityFilter(viewerId, viewerRole)
      ]
    }).populate('students.student', 'name profileImage').limit(5);


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







app.post('/students', async (req: Request, res: Response) => {
  try {
    const student = await Student.create(req.body);
    const { password, ...studentWithoutPassword } = student.toObject();
    res.status(201).json(studentWithoutPassword);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar aluno. Verifique se o e-mail já existe.' });
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







app.post('/projects', async (req: Request, res: Response) => {
  try {
    const adminStudent = req.body.adminStudent || getFirstAcceptedStudentId(req.body.students || []);
    const project = await Project.create({ ...req.body, adminStudent });
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar projeto', details: error });
  }
});


app.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { viewerId, viewerRole } = getViewerFromQuery(req);
    const project = await populateProjectById(req.params.id.toString());

    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    if (!canViewerAccessProject(project, viewerId, viewerRole)) {
      return res.status(403).json({ error: 'Este projeto ainda aguarda validação docente.' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projeto' });
  }
});


app.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const existingProject = await Project.findById(req.params.id);
    if (!existingProject) return res.status(404).json({ error: 'Projeto nÃ£o encontrado' });

    const requesterStudentId = req.body.requesterStudentId;
    delete req.body.requesterStudentId;
    delete req.body.adminStudent;

    if (!isAcceptedProjectMemberById(existingProject, requesterStudentId)) {
      return res.status(403).json({ error: 'Apenas membros aceitos podem editar o projeto.' });
    }

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
        if (!isProjectAdmin(existingProject, requesterStudentId)) {
          return res.status(403).json({
            error: 'Apenas o admin do projeto pode remover membros aceitos da equipe.'
          });
        }
      }

      if (nextAcceptedMemberIds.length === 0) {
        return res.status(400).json({ error: 'O projeto precisa manter pelo menos um membro aceito.' });
      }

      const currentAdminId = getProjectAdminId(existingProject);
      if (!currentAdminId || !nextAcceptedMemberIds.includes(currentAdminId)) {
        req.body.adminStudent = nextAcceptedMemberIds[0];
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
        if (!isProjectAdmin(existingProject, requesterStudentId)) {
          return res.status(403).json({
            error: 'Apenas o admin do projeto pode remover docentes convidados.'
          });
        }

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


app.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const requesterStudentId = typeof req.query.requesterStudentId === 'string'
      ? req.query.requesterStudentId
      : req.body?.requesterStudentId;
    const project = await Project.findById(req.params.id);
    const deletedProject = project;

    if (deletedProject && !isProjectAdmin(deletedProject, requesterStudentId)) {
      return res.status(403).json({
        error: 'Apenas o admin do projeto pode excluir o projeto.'
      });
    }

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
    const { professorId, status, comment } = req.body;

    if (!professorId) {
      return res.status(400).json({ error: 'Professor nao informado.' });
    }

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Projeto ou convite não encontrado.' });
    }

    const invitedProfessor = project.invitedProfessors.find(
      (invite: any) => invite.professor.toString() === professorId
    );

    if (!invitedProfessor) {
      return res.status(404).json({ error: 'Projeto ou convite não encontrado.' });
    }

    const existingEndorsement = project.endorsements.find(
      (endorsement: any) => endorsement.professor.toString() === professorId
    );

    if (status === 'accepted') {
      invitedProfessor.status = status;

      if (!existingEndorsement) {
        project.endorsements.push({
          professor: professorId,
          comment: comment || '',
          endorsedAt: new Date()
        });
      } else if (typeof comment === 'string') {
        existingEndorsement.comment = comment;
      }
    }

    if (status === 'declined') {
      project.invitedProfessors = project.invitedProfessors.filter(
        (invite: any) => invite.professor.toString() !== professorId
      ) as any;

      project.endorsements = project.endorsements.filter(
        (endorsement: any) => endorsement.professor.toString() !== professorId
      ) as any;
    }

    await project.save();

    const updatedProject = await populateProjectById(projectId);

    res.json({
      message: `Convite ${status === 'accepted' ? 'aceito e validado' : 'recusado'}!`,
      project: updatedProject
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar resposta do convite docente.' });
  }
});

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

    if (isProjectAdmin(project, studentId)) {
      const nextAdminStudent = getFirstAcceptedStudentId(project.students);
      project.adminStudent = nextAdminStudent as any;
    }

    await project.save();

    const updatedProject = await populateProjectById(projectId.toString());

    res.json({ message: 'Você saiu da equipe com sucesso.', project: updatedProject });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sair da equipe do projeto.' });
  }
});


app.post('/projects/:projectId/endorse', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { professorId, comment } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }


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


app.get('/projects-endorsed', async (req: Request, res: Response) => {
  try {

    const sampledProjects = await Project.aggregate([
      { $match: { "endorsements.0": { $exists: true } } },
      { $sample: { size: 3 } }
    ]);

    const endorsedProjects = await Project.populate(sampledProjects, [
      { path: 'students.student', select: 'name profileImage course' },
      { path: 'endorsements.professor', select: 'name academicTitle' }
    ]);

    res.json(endorsedProjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar projetos chancelados' });
  }
});






app.get('/professors/:id/projects', async (req: Request, res: Response) => {
  try {
    const projects = await Project.find({ "endorsements.professor": req.params.id })
      .populate('students.student', 'name course profileImage');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar projetos validados.' });
  }
});


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


app.listen(PORT, () => {
  console.log(`🚀 Servidor AcadeMe rodando na porta ${PORT}`);
});
