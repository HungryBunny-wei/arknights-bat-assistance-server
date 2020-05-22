import { Schema, model, Document } from 'mongoose';
import { UserDocument } from './user';

const CharacterSkillSchema = new Schema({ skillId: String, level: Number });
const CharacterSchema = new Schema({
    createTime: { type: Date, default: Date.now },

    code: {
        type: String,
        required: true,
    },
    level: {
        type: Number,
        default: 1,
    },
    phase: {
        type: Number,
        default: 0,
    },
    potentialRank: {
        type: Number,
        default: 0,
    },
    skills: {
        type: [CharacterSkillSchema],
        default: [],
    },
    creator: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
});

export declare interface CharacterDocument extends Document {
    /** 数据库 id */
    _id: Schema.Types.ObjectId;
    /** 干员代号 */
    code: string;
    /** 等级 */
    level: number;
    /** 精英化阶段 */
    phase: number;
    /** 潜能 */
    potentialRank: number;
    /** 技能 */
    skills: Array<{skillId: string;level: number;}>;
    /** 创建者 */
    creator: UserDocument;
    /** 创建时间 */
    createTime: Date;
}

/**
 * Character Model
 * 干员信息
 */
const Character = model<CharacterDocument>('Character', CharacterSchema);

export default Character;
