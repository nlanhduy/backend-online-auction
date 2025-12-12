export interface QuestionUser {
  id: string;
  fullName: string;
  role: string;
  avatar: string | null;
}

export interface QuestionWithUser {
  id: string;
  content: string;
  productId: string;
  userId: string;
  isDeleted: boolean;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: QuestionUser;
}

export interface QuestionTreeNode extends QuestionWithUser {
  children: QuestionTreeNode[];
  isOwner: boolean;
  isEditable: boolean;
}
