import IO from 'socket.io-client';
import platform from 'platform';

import config from '../config/client';
import store from './state/store';
import { guest, loginByToken, getLinkmansLastMessages, getLinkmanHistoryMessages, addFriend } from './service';
import {
    ActionTypes,
    SetLinkmanPropertyPayload,
    AddLinkmanHistoryMessagesPayload,
    AddLinkmanMessagePayload,
    DeleteMessagePayload,
} from './state/action';
import convertMessage from '../utils/convertMessage';
import getFriendId from '../utils/getFriendId';
import notification from '../utils/notification';
import playSound from '../utils/playSound';
import { Message, Linkman } from './state/reducer';
import voice from '../utils/voice';

const { dispatch } = store;

const options = {
    // reconnectionDelay: 1000,
};
const socket = IO(config.server, options);

async function loginFailback() {
    const defaultGroup = await guest(platform.os?.family, platform.name, platform.description);
    if (defaultGroup) {
        const { messages } = defaultGroup;
        dispatch({
            type: ActionTypes.SetGuest,
            payload: defaultGroup,
        });

        messages.forEach(convertMessage);
        dispatch({
            type: ActionTypes.AddLinkmanHistoryMessages,
            payload: {
                linkmanId: defaultGroup._id,
                messages,
            },
        });
    }
}

// 监听获取父窗口传来的token
const getTokenPromise: Promise<string> = new Promise<string>((resolve) => {
    const tid = setTimeout(() => {
        resolve('');
    }, 10000);
    window.addEventListener('message', ($event) => {
        if ($event.data.type === 'getTokenCallback') {
            clearTimeout(tid);
            window.localStorage.setItem('token', $event.data.data);
            resolve($event.data.data);
        }
    });
});

// 获取父节点token
async function getParentToken(): Promise<string> {
    if (window.parent) {
        window.parent.postMessage({ type: 'getToken' }, '*');
        const token = await getTokenPromise;
        return token;
    }
    const token = window.localStorage.getItem('token');
    if (token) {
        return token;
    }
    return '';
}

socket.on('connect', async () => {
    // @ts-ignore
    dispatch({ type: ActionTypes.Connect, payload: null });

    const token = await getParentToken();
    if (token) {
        const user = await loginByToken(
            token,
            platform.os?.family,
            platform.name,
            platform.description,
        );
        if (user) {
            dispatch({
                type: ActionTypes.SetUser,
                payload: user,
            });
            const linkmanIds = [
                ...user.groups.map((group: any) => group._id),
                ...user.friends.map((friend: any) => getFriendId(friend.from, friend.to._id)),
            ];
            const linkmanMessages = await getLinkmansLastMessages(linkmanIds);
            Object.values(linkmanMessages).forEach(
                // @ts-ignore
                (messages: Message[]) => messages.forEach(convertMessage),
            );
            dispatch({
                type: ActionTypes.SetLinkmansLastMessages,
                payload: linkmanMessages,
            });
            // 告诉父节点初始化完
            if (window.parent) {
                console.log('linkmanListViewInit');
                window.parent.postMessage({ type: 'linkmanListViewInit' }, '*');
            }
            return null;
        }
    }
    loginFailback();
    return null;
});

socket.on('disconnect', () => {
    // @ts-ignore
    dispatch({ type: ActionTypes.Disconnect, payload: null });
});

let windowStatus = 'focus';
window.onfocus = () => {
    windowStatus = 'focus';
};
window.onblur = () => {
    windowStatus = 'blur';
};

let prevFrom: string | null = '';
let prevName = '';
socket.on('message', async (message: any) => {
    convertMessage(message);

    const state = store.getState();
    const isSelfMessage = message.from._id === state.user?._id;
    if (isSelfMessage && message.from.tag !== state.user?.tag) {
        dispatch({
            type: ActionTypes.UpdateUserInfo,
            payload: {
                tag: message.from.tag,
            },
        });
    }

    const linkman = state.linkmans[message.to];
    let title = '';
    if (linkman) {
        dispatch({
            type: ActionTypes.AddLinkmanMessage,
            payload: {
                linkmanId: message.to,
                message,
            } as AddLinkmanMessagePayload,
        });
        if (linkman.type === 'group') {
            title = `${message.from.username} 在 ${linkman.name} 对大家说:`;
        } else {
            title = `${message.from.username} 对你说:`;
        }
    } else {
        // 联系人不存在并且是自己发的消息, 不创建新联系人
        if (isSelfMessage) {
            return;
        }
        const newLinkman = {
            _id: getFriendId(state.user?._id as string, message.from._id),
            type: 'temporary',
            createTime: Date.now(),
            avatar: message.from.avatar,
            name: message.from.username,
            messages: [],
            unread: 1,
        };
        dispatch({
            type: ActionTypes.AddLinkman,
            payload: {
                linkman: newLinkman as unknown as Linkman,
                focus: false,
            },
        });
        title = `${message.from.username} 对你说:`;

        const messages = await getLinkmanHistoryMessages(newLinkman._id, 0);
        if (messages) {
            dispatch({
                type: ActionTypes.AddLinkmanHistoryMessages,
                payload: {
                    linkmanId: newLinkman._id,
                    messages,
                } as AddLinkmanHistoryMessagesPayload,
            });
        }
    }

    if (windowStatus === 'blur' && state.status.notificationSwitch) {
        notification(
            title,
            message.from.avatar,
            message.type === 'text' ? message.content.replace(/&lt;/g, '<').replace(/&gt;/g, '>') : `[${message.type}]`,
            Math.random().toString(),
        );
    }

    if (state.status.soundSwitch) {
        const soundType = state.status.sound;
        playSound(soundType);
    }

    if (state.status.voiceSwitch) {
        if (message.type === 'text') {
            const text = message.content
                .replace(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/g, '')
                .replace(/#/g, '');

            if (text.length > 100) {
                return;
            }

            const from = linkman && linkman.type === 'group'
                ? `${message.from.username}${linkman.name === prevName ? '' : `在${linkman.name}`}说`
                : `${message.from.username}对你说`;
            if (text) {
                voice.push(from !== prevFrom ? from + text : text, message.from.username);
            }
            prevFrom = from;
            prevName = message.from.username;
        } else if (message.type === 'system') {
            voice.push(message.from.originUsername + message.content, '');
            prevFrom = null;
        }
    }
});

socket.on('changeGroupName', ({ groupId, name }: { groupId: string, name: string }) => {
    dispatch({
        type: ActionTypes.SetLinkmanProperty,
        payload: {
            linkmanId: groupId,
            key: 'name',
            value: name,
        } as SetLinkmanPropertyPayload,
    });
});

socket.on('deleteGroup', ({ groupId }: { groupId: string }) => {
    dispatch({
        type: ActionTypes.RemoveLinkman,
        payload: groupId,
    });
});

socket.on('changeTag', (tag: string) => {
    dispatch({
        type: ActionTypes.UpdateUserInfo,
        payload: {
            tag,
        },
    });
});

socket.on('deleteMessage', ({ linkmanId, messageId }: { linkmanId: string, messageId: string }) => {
    dispatch({
        type: ActionTypes.DeleteMessage,
        payload: {
            linkmanId,
            messageId,
        } as DeleteMessagePayload,
    });
});

// 监听获取父元素发送加好友提示
const addFriendPromise: Promise<string> = new Promise<string>((resolve) => {
    window.addEventListener('message', async ($event) => {
        if ($event.data.type === 'addFriend') {
            const state = store.getState();
            const friendId = $event.data.data;
            const linkmanId = getFriendId(state.user?._id as string, friendId);
            const linkman = state.linkmans[linkmanId];
            if (linkman) {
                console.log('我和他已经是好友了');
                dispatch({
                    type: ActionTypes.SetFocus,
                    payload: linkmanId,
                });
            } else {
                const friend: any = await addFriend(friendId);
                const newLinkman = {
                    _id: linkmanId,
                    from: state.user?._id,
                    to: {
                        _id: friendId,
                        username: friend.username,
                        avatar: friend.avatar,
                    },
                    type: 'friend',
                    createTime: Date.now(),
                };

                dispatch({
                    type: ActionTypes.AddLinkman,
                    payload: {
                        linkman: newLinkman as unknown as Linkman,
                        focus: true,
                    },
                });
                // @ts-ignore
                const messages = await getLinkmanHistoryMessages(state.user?._id, 0);
                if (messages) {
                    messages.forEach(convertMessage);
                    dispatch({
                        type: ActionTypes.AddLinkmanHistoryMessages,
                        payload: {
                            linkmanId: state.user?._id,
                            messages,
                        },
                    });
                }
                console.log('添加好友:', $event.data.data);
            }
            resolve($event.data);
        }
    });
});
addFriendPromise.then();
export default socket;
