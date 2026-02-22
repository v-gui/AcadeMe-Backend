import mongoose, { Schema, Document } from 'mongoose';

export interface IStudent extends Document {
  name: string;
  email: string;
  course: string; // Curso (Ex: Eng. Software)
  bio?: string;
  profileImage?: string;
  contactLink?: string; // LinkedIn ou GitHub
}

const StudentSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  course: { type: String, required: true },
  bio: { type: String },
  profileImage: { type: String },
  contactLink: { type: String }
}, {
  timestamps: true // Cria automaticamente campos createdAt e updatedAt
});

export default mongoose.model<IStudent>('Student', StudentSchema);