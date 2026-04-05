import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  title: string;
  description: string;
  tags: string[];
  imageUrl?: string;
  projectLink?: string;
  students: { 
    student: mongoose.Types.ObjectId; 
    status: 'pending' | 'accepted' | 'declined';
  }[];
  invitedProfessors: {
    professor: mongoose.Types.ObjectId;
    status: 'pending' | 'accepted' | 'declined';
  }[];
  posters: { url: string; name: string }[];
  files: { name: string; date: string; base64?: string }[];
  references: string[];
  endorsements: {
    professor: mongoose.Types.ObjectId;
    comment: string;
    endorsedAt: Date;
  }[];
}

const ProjectSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },  
  tags: { type: [String], default: [] },  
  imageUrl: { type: String, default: "" },
  projectLink: { type: String, default: "" },
  students: {
    type: [{
      student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
      status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
    }],
    required: true // O projeto precisa ter pelo menos o criador
  },
  invitedProfessors: {
    type: [{
      professor: { type: mongoose.Schema.Types.ObjectId, ref: 'Professor', required: true },
      status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
    }],
    default: []
  },
  posters: {
    type: [{
      url: { type: String },
      name: { type: String }
    }],
    default: []
  },  
  files: {
    type: [{
      name: { type: String },
      date: { type: String },
      base64: { type: String }
    }],
    default: []
  },

  references: { 
    type: [String], 
    default: [] 
  },

  endorsements: [{
  professor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Professor', 
    required: true 
  },
  comment: { 
    type: String, 
    default: '' 
  },
  endorsedAt: { 
    type: Date, 
    default: Date.now 
  }
}],

}, {
  timestamps: true
});

export default mongoose.model<IProject>('Project', ProjectSchema);
