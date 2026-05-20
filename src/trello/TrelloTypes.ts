export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  url: string;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  idBoard: string;
  pos: number;
}

export interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

export interface TrelloMember {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  date: string;
}

export interface TrelloCommentAction {
  id: string;
  idMemberCreator: string;
  date: string;
  data: {
    text: string;
    card?: { id: string; name: string };
    board?: { id: string; name: string };
    list?: { id: string; name: string };
  };
  memberCreator: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  idList: string;
  idBoard: string;
  pos: number;
  due: string | null;
  dueComplete: boolean;
  dateLastActivity: string;
  labels: TrelloLabel[];
  idMembers: string[];
  attachments?: TrelloAttachment[];
  actions?: TrelloCommentAction[];
  badges?: {
    comments: number;
    attachments: number;
  };
}
