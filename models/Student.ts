import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

// Validation function for array limit
function arrayLimit(val: string[]): boolean {
  return val.length <= 5;
}

export interface IStudent extends Document {
  name: string;
  email: string;
  course: string;
  bio?: string;
  profileImage?: string;
  contactLink?: string;
  password: string;
  interests: string[];
  
}

const StudentSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  course: { type: String, required: true },
  bio: { type: String },
  profileImage: { type: String },
  contactLink: { type: String },
  password: { type: String, required: true },
  interests: { 
    type: [String], 
    default: [],
    // Opcional: Validação no banco para garantir o limite de 5
    validate: [arrayLimit, '{PATH} excede o limite de 5 áreas de interesse']
  }
}, {
  timestamps: true 
});

/**
 * MIDDLEWARE: Hashing de senha automático
 * Antes de salvar o documento, o Mongoose verifica se a senha foi modificada
 * e aplica o hash (criptografia). Isso mantém a lógica de segurança centralizada no Model.
 */
StudentSchema.pre<IStudent>('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err: any) {
    next(err);
  }
});

export default mongoose.model<IStudent>('Student', StudentSchema);