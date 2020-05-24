import assert from 'assert';
import { Schema, Types } from 'mongoose';

import { KoaContext } from '../../types/koa';
import Character from '../models/character';


interface GetCharacterListData {
}

/**
 * 获取我的干员列表
 * @param ctx Context
 */
export async function getCharacterList(ctx: KoaContext<GetCharacterListData>) {
    const result = await Character.find(
        { creator: ctx.socket.user },
        undefined,
        { sort: { createTime: -1 }, limit: 200 },
    );
    // 填充
    // .populate('from', { username: 1, avatar: 1, tag: 1 });
    return result;
}

interface addCharacterData {
    /** 干员代号 */
    code: string;
    /** 等级 */
    level: number;
    /** 精英化阶段 */
    phase: number;
    /** 潜能 */
    potentialRank: number;
    /** 技能 */
    skills: Array<{ skillId: string; level: number; }>;
}

/**
 * 添加干员
 * @param ctx Context
 */
export async function addCharacter(ctx: KoaContext<addCharacterData>) {
    assert(ctx.data.code, '干员编码不能为空');

    assert(
        !await Character.exists({ creator: ctx.socket.user, code: ctx.data.code }),
        '你已拥有该干员',
    );

    let newCharacter = null;
    try {
        newCharacter = await Character.create({
            ...ctx.data,
            creator: ctx.socket.user,
        });
    } catch (err) {
        if (err.name === 'ValidationError') {
            return '群组名包含不支持的字符或者长度超过限制';
        }
        throw err;
    }
    // 连接
    // ctx.socket.join(newGroup._id.toString());
    return {
        _id: newCharacter._id,
        code: newCharacter.code,
        createTime: newCharacter.createTime,
        creator: newCharacter.creator,
    };
}


interface ChangeCharacterData {
    /** 数据库 id */
    _id: Schema.Types.ObjectId;
    /** 等级 */
    level: number;
    /** 精英化阶段 */
    phase: number;
    /** 潜能 */
    potentialRank: number;
    /** 技能 */
    skills: Array<{ skillId: string; level: number; }>;
}

/**
 * 修改干员属性
 * @param ctx Context
 */
export async function changeCharacter(ctx: KoaContext<ChangeCharacterData>) {
    const { data } = ctx;

    await Character.updateOne(
        { _id: data._id },
        {
            level: data.level,
            phase: data.phase,
            potentialRank: data.potentialRank,
            skills: data.skills,
        },
    );

    return {};
}


interface GetSupportListData {
    code?: string
    page: {
        index?: number,
    }
}


/**
 * 获取支援列表
 * @param ctx Context
 */
export async function getSupportList(ctx: KoaContext<GetSupportListData>) {
    const { data } = ctx;
    assert(data.page, '分页参数不能为空');
    const start = (data.page.index || 0) * 5;
    const conditions: any = {};
    if (data.code) {
        conditions.code = data.code;
    }
    const result = await Character.find(
        conditions,
        undefined,
        { sort: { phase: -1, level: -1, potentialRank: 1 } },
    ).skip(start).limit(start + 5).populate('creator', { _id: 1, username: 1, avatar: 1, tag: 1 });
    const count = await Character.find(
        conditions,
    ).count();
    return {
        result,
        total: count,
    };
}
