import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';


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

    validate: [arrayLimit, '{PATH} excede o limite de 5 áreas de interesse']
  }
}, {
  timestamps: true 
});


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