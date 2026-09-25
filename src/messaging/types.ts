export interface IncomingMessage {
  userId: number;
  text: string;
}

export type MessageHandler = (message: IncomingMessage) => Promise<void>;

export interface MessagingProvider {
  onMessage(handler: MessageHandler): void;
  send(userId: number, text: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

