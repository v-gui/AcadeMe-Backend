import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  title: string;
  description: string;
  tags: string[]; // Ex: ["React", "Backend", "Design"]
  imageUrl?: string;
  projectLink?: string;
  student: mongoose.Types.ObjectId; // Referência ao ID do aluno
  
  // --- NOVOS CAMPOS ADICIONADOS ---
  posters: { url: string; name: string }[];
  files: { name: string; date: string; base64?: string }[];
  references: string[];
}

const ProjectSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  tags: { type: [String], default: [] },
  imageUrl: { type: String },
  projectLink: { type: String },
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Student', 
    required: true 
  },

  // --- DEFINIÇÃO DOS NOVOS CAMPOS NO SCHEMA ---
  posters: [{
    url: { type: String },
    name: { type: String }
  }],
  
  files: [{
    name: { type: String },
    date: { type: String },
    base64: { type: String } // Armazenando a string base64 do arquivo
  }],

  references: { 
    type: [String], 
    default: [] 
  }

}, {
  timestamps: true
});

export default mongoose.model<IProject>('Project', ProjectSchema);