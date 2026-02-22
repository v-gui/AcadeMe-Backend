import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  title: string;
  description: string;
  tags: string[]; // Ex: ["React", "Backend", "Design"]
  imageUrl?: string;
  projectLink?: string;
  student: mongoose.Types.ObjectId; // Referência ao ID do aluno
}

const ProjectSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  tags: { type: [String], default: [] },
  imageUrl: { type: String },
  projectLink: { type: String },
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Student', // Nome do modelo referenciado
    required: true 
  }
}, {
  timestamps: true
});

export default mongoose.model<IProject>('Project', ProjectSchema);