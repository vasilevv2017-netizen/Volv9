export interface CanMessage {
  id: string; // Hex CAN ID (extended 8-chars in J1939)
  payload: string; // Message bytes in Hex sequence
  timestamp: string; // ISO or relative timestamp
  direction: 'RX' | 'TX'; // Received or Transmitted
  length: number; // Message data length
  decodedInfo?: string; // Informational parsed J1939 parameter
  count?: number; // Quantity of times this message ID has been received
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BluetoothConfig {
  speed: '250' | '500';
  serviceUuid: string;
  charUuid: string;
  useSimulator: boolean;
}

export type LogType = 'connect' | 'read' | 'write';

export interface SessionAnalysisResult {
  sessionType: string;
  requestCanId: string;
  responseCanId: string;
  targetAddress: string;
  toolAddress: string;
  securityLevel: string;
  seedSent: string;
  keySent: string;
  seedKeyTimeMs: string;
  sidRequest: string;
  status: string;
  parametersDetails?: Array<{
    id: string;
    name: string;
    value: string;
  }>;
}

export interface TraceProgramStep {
  cmd: string;
  info: string;
  status?: 'pending' | 'sending' | 'success' | 'failed';
  responseReceived?: string;
}
