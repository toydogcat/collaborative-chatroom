/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChatMessage {
  id: string;
  user: string;
  role: 'host' | 'user';
  text: string;
  imageUrl?: string; // Base64 or standard URL
  timestamp: number;
  isSpeech?: boolean; // True if created via speech-to-text
}

export interface Room {
  code: string;
  hostToken: string; // Secret for host-only verification
  hostName: string;
  password?: string; // Optional room password
  chats: ChatMessage[];
  pinnedIds: string[]; // List of message IDs focused/pinned by the host
  announcement: string; // Markdown announcement text
  createdAt: number;
  updatedAt: number;
}

export interface JoinRoomPayload {
  code: string;
  userName: string;
}

export interface SyncResponse {
  room: {
    code: string;
    hostName: string;
    chats: ChatMessage[];
    pinnedIds: string[];
    announcement: string;
    createdAt: number;
    updatedAt: number;
  };
  isHost: boolean;
}
