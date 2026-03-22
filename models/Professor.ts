import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ProfessorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  department: { type: String, required: true }, // Ex: Ciência da Computação, Engenharia...
  academicTitle: { type: String, default: 'Professor' }, // Ex: Mestre, Doutor, Especialista
  bio: { type: String, default: '' },
  profileImage: { type: String, default: '' },
  areasOfExpertise: { type: [String], default: [] } // Semelhante aos "interests" dos alunos
}, { timestamps: true });

// Hash da senha antes de salvar
ProfessorSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

export default mongoose.model('Professor', ProfessorSchema);