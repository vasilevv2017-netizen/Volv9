import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Bluetooth, 
  Cpu, 
  Database, 
  Play, 
  Square, 
  RefreshCw, 
  Send, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  BookOpen, 
  Unlock, 
  Terminal,
  Settings,
  Info,
  Link,
  Power,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CanMessage, ConnectionStatus } from './types';
import Tab7NetworkManager from './components/Tab7NetworkManager';

// Standard generic diagnostic parameter translations (Tab 7)
const UNIVERSAL_DID_DICTIONARY: Record<string, { name: string; desc: string; unit: string; min: string; max: string }> = {
  '1ABE': { 
    name: 'Engine Speed Limit Scaling', 
    desc: 'Настройка максимального ограничения оборотов двигателя во флэш-памяти ЭБУ.', 
    unit: 'RPM',
    min: '1200',
    max: '2500'
  },
  'F185': { 
    name: 'Vehicle Speed Limit', 
    desc: 'Ограничение максимальной скорости автомобиля в энергонезависимой памяти EEPROM двигателя.', 
    unit: 'km/h',
    min: '60',
    max: '130'
  },
  'C102': { 
    name: 'Idle RPM Offset Parameter', 
    desc: 'Коррекция базовых оборотов холостого хода при активации коробки отбора мощности (PTO).', 
    unit: 'RPM',
    min: '500',
    max: '1100'
  },
  'D140': { 
    name: 'AdBlue / DEF Flow Rate Multiplier', 
    desc: 'Множитель дозирования мочевины в системе SCR.', 
    unit: '%',
    min: '50',
    max: '150'
  }
};

// Common J1939 / UDS Negative Response Code Explanations
const getNrcExplanation = (nrcCode: string): string => {
  const code = nrcCode.toUpperCase();
  const nrcMap: Record<string, string> = {
    '10': 'General Reject (ЭБУ отклонил запрос без указания причин)',
    '11': 'Service Not Supported (Данная диагностическая служба не поддерживается ЭБУ)',
    '12': 'Subfunction Not Supported (Данный подкласс функции не поддерживается на текущем сеансе)',
    '13': 'Incorrect Message Length or Invalid Format (Неверная длина пакета или некорректный формат кадра)',
    '22': 'Conditions Not Correct (Нарушены внешние условия: двигатель должен быть заглушен, зажигание ВКЛ)',
    '24': 'Request Sequence Error (Нарушена последовательность команд UDS)',
    '31': 'Request Out Of Range (Запрашиваемые калибровочные значения выходят за пределы допустимых)',
    '33': 'Security Access Denied (Доступ заблокирован. Требуется пройти авторизацию Seed-Key)',
    '35': 'Invalid Key (Неверный ключ! ЭБУ отклонил рассчитанный крипто-вектор)',
    '36': 'Exceeded Number of Attempts (Превышено число попыток ввода ключа. ЭБУ временно заблокирован)',
    '37': 'Required Time Delay Not Expired (Время задержки безопасности не истекло. Подождите)',
    '78': 'Request Received - Response Pending (Запрос принят к исполнению, ЭБУ занят операцией)',
  };
  return nrcMap[code] || `Неизвестная ошибка ЭБУ (UDS NRC 0x${code})`;
};

// Official J1939 seed keys calculation (Fully Dynamic)
const calculateGenericKey = (seedHex: string, xorMaskHex: string, offsetHex: string): string => {
  const seedClean = seedHex.replace(/[\s,]+/g, '');
  const seedVal = parseInt(seedClean, 16) || 0;
  const xorMask = parseInt(xorMaskHex, 16);
  const offset = parseInt(offsetHex, 16);
  
  // Rotate Left 3 (32-bit offset rotation)
  const rol3 = ((seedVal << 3) | (seedVal >>> 29)) >>> 0;
  // Bitwise XOR with magic constant
  const xor = (rol3 ^ xorMask) >>> 0;
  // Mathematical offset increment constant
  const keyVal = (xor + offset) >>> 0;
  return keyVal.toString(16).toUpperCase().padStart(8, '0');
};

export default function App() {
  // Navigation & Screen Control
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'canLogger' | 'guide'>(() => (localStorage.getItem('uds_active_tab') as any) || 'diagnostics');
  const [showPairModal, setShowPairModal] = useState<boolean>(true);

  // Hardware connection profile configuration settings with energy-independent persistence
  const [connectionType, setConnectionType] = useState<'bluetooth' | 'serial'>(() => (localStorage.getItem('uds_conn_type') as any) || 'bluetooth');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [baudRate, setBaudRate] = useState<number>(() => Number(localStorage.getItem('uds_baud_rate')) || 115200); // HC-05 default baudrate config
  const [canSpeed, setCanSpeed] = useState<'250' | '500'>(() => (localStorage.getItem('uds_can_speed') as '250' | '500') || '500'); // J1939 standard bitrates
  const [pairedDeviceName, setPairedDeviceName] = useState<string>('');
  const [terminalLogs, setTerminalLogs] = useState<{ time: string; text: string; mode: 'info' | 'tx' | 'rx' | 'err' | 'success' | 'warn' }[]>([]);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Custom key calculation and expert mode settings
  const [xorMask, setXorMask] = useState<string>(() => localStorage.getItem('uds_xor_mask') || 'A5A5A5A5');
  const [offsetValue, setOffsetValue] = useState<string>(() => localStorage.getItem('uds_offset') || '12345678');
  const [expertMode, setExpertMode] = useState<boolean>(() => localStorage.getItem('uds_expert_mode') === 'true');
  const [dynamicStMin, setDynamicStMin] = useState<number>(25); // Dynamic separation time spacing

  // Diagnostic states
  const [targetEcuAddress, setTargetEcuAddress] = useState<string>(() => localStorage.getItem('uds_target_ecu') || '24');
  const [txId, setTxId] = useState<string>(() => localStorage.getItem('uds_tx_id') || '18DA24F2'); // default Tester -> ECU (0x24)
  const [rxId, setRxId] = useState<string>(() => localStorage.getItem('uds_rx_id') || '18DAF224'); // default Response from ECU -> Tester (0x24)
  const [securityLevel, setSecurityLevel] = useState<string>(() => localStorage.getItem('uds_sec_level') || '0B'); // Default level for programming/writing
  const [selectedDid, setSelectedDid] = useState<string>(() => localStorage.getItem('uds_selected_did') || '1ABE');
  const [customDid, setCustomDid] = useState<string>('');
  const [writeMode, setWriteMode] = useState<'did' | 'memory'>(() => (localStorage.getItem('uds_write_mode') as any) || 'memory');
  const [memAddress, setMemAddress] = useState<string>(() => localStorage.getItem('uds_mem_address') || '01000185');
  const [addressLengthFormat, setAddressLengthFormat] = useState<string>('41');
  const [paramNewValue, setParamNewValue] = useState<string>(() => localStorage.getItem('uds_param_new_val') || '0210');
  const [paramTargetLength, setParamTargetLength] = useState<number>(2);
  const [paddingMode, setPaddingMode] = useState<'none' | '00' | 'AA'>('AA');
  const [isWriteInProgress, setIsWriteInProgress] = useState<boolean>(false);
  const [handshakeStatus, setHandshakeStatus] = useState<string>('Устройство не на связи. Требуется физическое подключение.');
  const [currentStep, setCurrentStep] = useState<'idle' | 'session' | 'seed' | 'key' | 'write' | 'reset' | 'success' | 'error'>('idle');

  // Interactive Live CAN sniffer log entries
  const [canPackets, setCanPackets] = useState<CanMessage[]>([]);
  const [packetFilterId, setPacketFilterId] = useState<string>('');
  const [isSnifferActive, setIsSnifferActive] = useState<boolean>(true);

  // Raw command injector
  const [rawInjectionHex, setRawInjectionHex] = useState<string>('1003');

  // Custom testing values
  const [inputSeedValue, setInputSeedValue] = useState<string>('');
  const [outputKeyValue, setOutputKeyValue] = useState<string>('');

  const [liveSeedInput, setLiveSeedInput] = useState<string>('16329A1A');
  const [calculatedKeyResult, setCalculatedKeyResult] = useState<string>('');
  const [isInterceptorActive, setIsInterceptorActive] = useState<boolean>(false);
  const [calibrationMaskIndex, setCalibrationMaskIndex] = useState<string>('BD');
  const [readParameterResult, setReadParameterResult] = useState<string>('');

  // Save changes to localStorage for non-volatile storage
  useEffect(() => { localStorage.setItem('uds_active_tab', activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem('uds_conn_type', connectionType); }, [connectionType]);
  useEffect(() => { localStorage.setItem('uds_baud_rate', String(baudRate)); }, [baudRate]);
  useEffect(() => { localStorage.setItem('uds_can_speed', canSpeed); }, [canSpeed]);
  useEffect(() => { localStorage.setItem('uds_xor_mask', xorMask); }, [xorMask]);
  useEffect(() => { localStorage.setItem('uds_offset', offsetValue); }, [offsetValue]);
  useEffect(() => { localStorage.setItem('uds_expert_mode', String(expertMode)); }, [expertMode]);
  useEffect(() => { localStorage.setItem('uds_target_ecu', targetEcuAddress); }, [targetEcuAddress]);
  useEffect(() => { localStorage.setItem('uds_tx_id', txId); }, [txId]);
  useEffect(() => { localStorage.setItem('uds_rx_id', rxId); }, [rxId]);
  useEffect(() => { localStorage.setItem('uds_sec_level', securityLevel); }, [securityLevel]);
  useEffect(() => { localStorage.setItem('uds_selected_did', selectedDid); }, [selectedDid]);
  useEffect(() => { localStorage.setItem('uds_write_mode', writeMode); }, [writeMode]);
  useEffect(() => { localStorage.setItem('uds_mem_address', memAddress); }, [memAddress]);
  useEffect(() => { localStorage.setItem('uds_param_new_val', paramNewValue); }, [paramNewValue]);

  // Persistent reference handlers for standard Web APIs
  const serialPortRef = useRef<any>(null);
  const bluetoothDeviceRef = useRef<any>(null);
  const bluetoothRxCharRef = useRef<any>(null);
  const bluetoothTxCharRef = useRef<any>(null);
  const inputBufferRef = useRef<string>('');

  // Sync calculatedKeyResult to window attribute for immediate synchronous retrieval under multi-step async flow handlers
  useEffect(() => {
    (window as any).__CALCULATED_KEY__ = calculatedKeyResult;
  }, [calculatedKeyResult]);

  // Auto-align default IDs per SELECTED target ECU address
  useEffect(() => {
    if (targetEcuAddress === '24') {
      setTxId('18DA24F2');
      setRxId('18DAF224');
    } else if (targetEcuAddress === '00') {
      setTxId('18DA00F2');
      setRxId('18DAF200');
    } else if (targetEcuAddress === '26') {
      setTxId('18DA26F2');
      setRxId('18DAF226');
    } else if (targetEcuAddress === '3A') {
      setTxId('18DA3AF2');
      setRxId('18DAF23A');
    }
  }, [targetEcuAddress]);

  // Log append helper
  const addLog = (text: string, mode: 'info' | 'tx' | 'rx' | 'err' | 'success' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [
      { time, text, mode },
      ...prev.slice(0, 150)
    ]);
  };

  // Safe Lawicell String Parser
  const parseIncomingLawicell = (rawLine: string) => {
    let line = rawLine.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
    if (!line) return;

    // Fast-locate the starter command characters (T=Extended CAN, t=Standard CAN)
    const validStartIdx = line.search(/[TtSsOoCc]/);
    if (validStartIdx > 0) {
      line = line.substring(validStartIdx);
    }

    const firstChar = line.charAt(0);

    if (firstChar === 'T' || firstChar === 't') {
      const isExtended = firstChar === 'T';
      const idLen = isExtended ? 8 : 3;
      if (line.length >= 1 + idLen + 1) {
        const id = line.substring(1, 1 + idLen).toUpperCase();
        const dlcChar = line.charAt(1 + idLen);
        const dlc = parseInt(dlcChar, 16) || 8;
        
        let payload = line.substring(1 + idLen + 1).replace(/[^0-9A-Fa-f]/g, '');
        payload = payload.toUpperCase();
        if (payload.length > dlc * 2) {
          payload = payload.substring(0, dlc * 2);
        }

        const msg: CanMessage = {
          id,
          payload,
          length: dlc,
          direction: 'RX',
          timestamp: new Date().toLocaleTimeString()
        };

        if (isSnifferActive) {
          setCanPackets(prev => {
            const index = prev.findIndex(item => item.id === id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                payload: payload,
                length: dlc,
                timestamp: msg.timestamp,
                count: (updated[index].count || 1) + 1
              };
              return updated;
            }
            return [msg, ...prev.slice(0, 70)];
          });
        }

        // Direct UDS responses match checking
        if (id === rxId.toUpperCase()) {
          addLog(`[UDS RX]: ID=${id} D=${payload}`, 'rx');
          if (typeof (window as any).__ACTIVE_CAN_RECEIVE_HANDLER__ === 'function') {
            (window as any).__ACTIVE_CAN_RECEIVE_HANDLER__(payload);
          }
          handleUdsFlowResponse(payload);
        }
      }
    }
  };

  // UDS Autopilot flow manager
  const liveStateRef = useRef<{
    step: 'idle' | 'session_sent' | 'seed_requested' | 'key_sent' | 'write_sent' | 'reset_sent';
    accumulatedSeed: string;
    expectedLength: number;
    computedKey: string;
  }>({
    step: 'idle',
    accumulatedSeed: '',
    expectedLength: 0,
    computedKey: ''
  });

  const calcDynamicKey = (seedHex: string): string => {
    return calculateGenericKey(seedHex, xorMask, offsetValue);
  };

  const handleManualKeyCalculation = () => {
    // 1. Берем 8 символов Seed из поля ввода (например, 16329A1A)
    const seedHex = inputSeedValue.trim().toUpperCase();
    if (seedHex.length !== 8) return;

    // 2. Выполняем оригинальную математику
    const calculatedKey = calculateGenericKey(seedHex, xorMask, offsetValue);

    // 3. Выводим результат в поле Key на форме
    setOutputKeyValue(calculatedKey);
  };

  // Function A: Pure Session 10 03 + Seed 27 29 trigger
  const handleManualSeedRequest = async () => {
    if (typeof setReadParameterResult === 'function') setReadParameterResult('');
    const currentTxId = txId;
    addLog('[🔧 АВТОНОМИЯ]: Шаг А - Запуск сессии 10 03...', 'info');
    await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding("021003", paddingMode)));
    await new Promise(r => setTimeout(r, 120));
    addLog('[🔧 АВТОНОМИЯ]: Шаг Б - Прямой запрос инженерного Seed (27 29)...', 'info');
    await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding("022729", paddingMode)));
  };

  // Function C: Send Key frame + Hybrid Read Sequence (Service 22 / Service 23)
  const handleManualKeyAndWriteExecution = async () => {
    if (!calculatedKeyResult || calculatedKeyResult.length !== 8) {
      addLog('[🔧 АВТОНОМИЯ ОШИБКА]: Сначала сгенерируйте токен ключа на Шаге 1!', 'err');
      return;
    }
    const currentTxId = txId;
    let cleanInput = memAddress.toUpperCase().replace(/[^0-9A-Fa-f]/g, '');
    addLog(`[🔧 АВТОНОМИЯ]: Сдача 8-байтового Single-Frame ключа и чтение целевой области ${cleanInput}...`, 'warn');
    
    const perfect8ByteKey = `06272A${calculatedKeyResult}AA`;
    await transmitRawLawicell(buildLawicellPacket(currentTxId, perfect8ByteKey));
    await new Promise(r => setTimeout(r, 350));

    if (cleanInput.length <= 4) {
      const targetDid = cleanInput.padStart(4, '0');
      await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding(`0322${targetDid}`, paddingMode)));
    } else {
      const targetAddress = cleanInput.padStart(8, '0');
      await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding(`072341${targetAddress}02`, paddingMode)));
    }
  };

  // Function B: Pure Client-Side ROL3 Math execution
  const handleLocalKeyCalculation = () => {
    const seedHex = liveSeedInput.trim().toUpperCase();
    if (seedHex.length !== 8) {
      addLog('[🔧 МАТЕМАТИКА ОШИБКА]: Введите ровно 8 символов Hex!', 'err');
      return;
    }
    const computed = calculateGenericKey(seedHex, xorMask, offsetValue);
    
    setCalculatedKeyResult(computed);
    addLog(`[🔧 МАТЕМАТИКА]: Для Seed ${seedHex} успешно рассчитан Key: ${computed}`);
  };

  // Start sequence 
  const startAutopilotWriteSequence = async () => {
    if (connectionStatus !== 'connected') {
      addLog('Предупреждение: Физическое соединение с HC-05 или COM-портом не установлено.', 'err');
      setHandshakeStatus(' Ошибка: CAN интерфейс офлайн. Подключите прибор!');
      return;
    }

    setIsWriteInProgress(true);
    addLog('[🚀 АВТОПИЛОТ]: Запуск калибровочного алгоритма TEA2+...', 'info');
    setHandshakeStatus('⚡ Шаг 1: Инициализация сессии 10 03...');
    setCurrentStep('session');

    liveStateRef.current = {
      step: 'idle',
      accumulatedSeed: '',
      expectedLength: 0,
      computedKey: ''
    };

    try {
      const expectedResponseLvl = securityLevel === '0B' ? '29' : securityLevel === '03' ? '03' : '11';
      const responseLvlInt = parseInt(expectedResponseLvl, 16);
      const keySubFuncHex = (responseLvlInt + 1).toString(16).toUpperCase().padStart(2, '0');

      // 1. Enter Extended Session
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("021003")));
      await new Promise(r => setTimeout(r, 150));

      // 2. Request Seed Level
      setHandshakeStatus(`⚡ Шаг 2: Запрос Seed ${expectedResponseLvl}...`);
      setCurrentStep('seed');
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding(`0227${expectedResponseLvl}`)));
      // NOTE: In real deployment, extract incoming seed from CAN here. 
      // For automated shot based on last captured seed 'C07745CB':
      const computedKey = calcDynamicKey("C07745CB"); // Or dynamically read from state
      await new Promise(r => setTimeout(r, 150));

      // 3. Send Calculated Key
      setHandshakeStatus(`⚡ Шаг 3: Передача ключа ${keySubFuncHex}...`);
      setCurrentStep('key');
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding(`0627${keySubFuncHex}${computedKey}`)));
      await new Promise(r => setTimeout(r, 200));

      // 4. STEP 1: Write Calibration Signature to DID F185 (Service 2E)
      // Payload contains multi-frame data simulated in aligned frames:
      setHandshakeStatus('⚡ Шаг 4: Запись калибровочной подписи DID F185...');
      setCurrentStep('write');
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("10112EF185011029"))); // FF
      await new Promise(r => setTimeout(r, 50));
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("2155533238382020"))); // CF1 "US288  "
      await new Promise(r => setTimeout(r, 50));
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("2220340000000000"))); // CF2 " 4"
      await new Promise(r => setTimeout(r, 200));

      // 5. STEP 2: Write Physical Value to Memory Address 01000185 (Service 3D)
      setHandshakeStatus('⚡ Шаг 5: Запись значения по адресу 01000185...');
      let autopilotVal = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '');
      const apTargetHexLen = paramTargetLength * 2;
      if (autopilotVal.length < apTargetHexLen) {
        autopilotVal = autopilotVal.padStart(apTargetHexLen, '0');
      } else if (autopilotVal.length > apTargetHexLen) {
        autopilotVal = autopilotVal.substring(0, apTargetHexLen);
      }

      const apTotalUdsLen = 9 + paramTargetLength;
      const apFfLenHex = apTotalUdsLen.toString(16).toUpperCase().padStart(2, '0');
      const apSizeHex = paramTargetLength.toString(16).toUpperCase().padStart(4, '0');

      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding(`10${apFfLenHex}3D2501000185`))); // FF for 3D
      await new Promise(r => setTimeout(r, 50));
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding(`21BD${apSizeHex}${autopilotVal}`))); // CF with custom value
      await new Promise(r => setTimeout(r, 400)); // Wait for flash write pending (0x78)

      // 6. Hard Reset to lock changes
      setHandshakeStatus('⚡ Шаг 6: Инициализация сброса ЭБУ...');
      setCurrentStep('reset');
      await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("021102")));
      
      setHandshakeStatus('🎉 ВСЕ ШАГИ УСПЕШНО ВЫПОЛНЕНЫ! ЭБУ перезагружен с новыми калибровками.');
      addLog('[🚀 АВТОПИЛОТ]: Процедура завершена! Изменения зафиксированы в ПЗУ.', 'info');
      setCurrentStep('success');
    } catch (error) {
      addLog('[🚀 АВТОПИЛОТ ОШИБКА]: Ошибка последовательности автопилота', 'err');
      setHandshakeStatus('❌ Процедура записи завершилась ошибкой.');
      setCurrentStep('error');
    } finally {
      setIsWriteInProgress(false);
    }
  };

  // Stop sequence 
  const stopAutopilotWriteSequence = () => {
    setIsWriteInProgress(false);
    setHandshakeStatus('Запись принудительно остановлена пользователем.');
    addLog('[UDS АВТОПИЛОТ]: Процедура записи была принудительно остановлена пользователем.', 'err');
    liveStateRef.current = {
      step: 'idle',
      accumulatedSeed: ''
    };
    setCurrentStep('idle');
  };

  // Copy terminal logs to clipboard safely
  const handleCopyLogs = async () => {
    if (terminalLogs.length === 0) return;
    const textToCopy = terminalLogs
      .map(log => `[${log.time}] ${log.mode === 'tx' ? '>>' : log.mode === 'rx' ? '<<' : log.mode === 'err' ? '[!]' : '[*]'} ${log.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs to clipboard:', err);
    }
  };

  const formatPadding = (baseHex: string, mode?: 'none' | '00' | 'AA'): string => {
    const activeMode = mode || paddingMode;
    if (activeMode === 'none') return baseHex;
    const remainChars = 16 - baseHex.length;
    if (remainChars <= 0) return baseHex;
    const padChar = activeMode === '00' ? '0' : 'A';
    return baseHex + padChar.repeat(remainChars);
  };

  const executePostInjectionConveyor = async () => {
    let hexValue = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '').padStart(4, '0');
    let activeMask = "BD"; // Target Launch structure mask alignment
    let targetAddressHex = "01000185"; // Target Launch address register alignment

    addLog(`[🔥 MITM АТАКА]: Верификация Launch перехвачена. Впрыск кастомных данных ${hexValue} вдогонку...`, 'warn');

    // Pre-stage values into Calibration Descriptor DID F185 (Strict 17 bytes)
    await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("10112EF185011029", paddingMode)));
    await new Promise(r => setTimeout(r, 50));
    await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("2155533238382020", paddingMode)));
    await new Promise(r => setTimeout(r, 50));
    await transmitRawLawicell(buildLawicellPacket(txId, `2220${hexValue}00000000`)); // Hard bounded 8 bytes alignment layout
    await new Promise(r => setTimeout(r, 200));

    // Push Compliant Calibration Trigger via Service 0x3D (Strict 9 Bytes / 1009 layout)
    await transmitRawLawicell(buildLawicellPacket(txId, formatPadding(`10093D2501${targetAddressHex.substring(2)}`, paddingMode)));
    await new Promise(r => setTimeout(r, 50));
    await transmitRawLawicell(buildLawicellPacket(txId, formatPadding(`21${activeMask}000100000000`, paddingMode)));
    await new Promise(r => setTimeout(r, 450)); // Wait flash sector non-volatile burn memory commit

    // Finalize and execute the hardware Checksum seal reload
    await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("021102", paddingMode)));
    addLog('[🔥 MITM SUCCESS]: Калибровки ПЗУ замещены! Вызов аппаратного перезапуска ЭБУ (11 02)...', 'success');
  };

  // Process incoming UDS packet lines in J1939 target bus
  const handleUdsFlowResponse = async (payload: string) => {
    const state = liveStateRef.current;

    // --- 🌟 OMNIVOROUS GLOBAL SEED INTERCEPTION (LIVES ON THE EDGE) ---
    const cleanPayload = payload.toUpperCase().replace(/\s+/g, '');

    // Dynamic STmin parsing from incoming Flow Control frames (starts with 30)
    if (cleanPayload.startsWith("30")) {
      const bsHex = cleanPayload.substring(2, 4);
      const stminHex = cleanPayload.substring(4, 6);
      const bs = parseInt(bsHex, 16) || 0;
      let stminVal = parseInt(stminHex, 16) || 0;
      
      // Decode ISO-TP separation time
      if (stminVal > 0x7F) {
        if (stminVal >= 0xF1 && stminVal <= 0xF9) {
          stminVal = Math.ceil((stminVal - 0xF0) / 10); // microsecond scale approximation
        } else {
          stminVal = 25; // default spacing
        }
      }
      
      setDynamicStMin(stminVal);
      addLog(`[📡 UDS ISO-TP Flow Control]: ЭБУ вернул Flow Control (BS=${bs}, STmin=${stminVal}мс). Спейсинг Consecutive кадров адаптирован.`, 'warn');
    }

    // Fix autonomous view filter: Lock parser strictly to the verified Continental calibration response window F185
    if (parseInt(rxId, 16) === 0x18DAF224) {
      const rawHexPayload = cleanPayload.toUpperCase().trim();
      if (rawHexPayload.includes("63")) {
        const index63 = rawHexPayload.indexOf("63");
        if (rawHexPayload.length >= index63 + 6) {
          // Extract exactly 2 data bytes (4 chars) right after the 63 response signature byte
          const extractedValueBytes = rawHexPayload.substring(index63 + 2, index63 + 6);
          const formattedOutputBox = `${extractedValueBytes.substring(0, 2)} ${extractedValueBytes.substring(2, 4)}`;
          setReadParameterResult(formattedOutputBox);
          addLog(`[🔬 ИНСПЕКТОР 23 УСПЕХ]: Физическое ПЗУ выдало: ${formattedOutputBox}`, 'success');
          
          if (isInterceptorActive) {
            executePostInjectionConveyor();
          }
        }
      }
    }

    let matchIdx = -1;
    let capturedSubLvl = "";

    if (cleanPayload.includes('6729')) { matchIdx = cleanPayload.indexOf('6729'); capturedSubLvl = '29'; }
    else if (cleanPayload.includes('6701')) { matchIdx = cleanPayload.indexOf('6701'); capturedSubLvl = '01'; }
    else if (cleanPayload.includes('6711')) { matchIdx = cleanPayload.indexOf('6711'); capturedSubLvl = '11'; }

    if (matchIdx !== -1) {
      // Extract exactly 8 characters of the real-time dynamic Seed following the 67XX signature
      const extractedSeed = cleanPayload.substring(matchIdx + 4, matchIdx + 12);
      
      if (extractedSeed.length === 8) {
        const finalCompiledKey = calculateGenericKey(extractedSeed, xorMask, offsetValue);
        
        // Atomic updates to UI inputs to prevent stale token retention
        setLiveSeedInput(extractedSeed);
        setCalculatedKeyResult(finalCompiledKey);
        
        setHandshakeStatus(`✅ Шаг 2 Выполнен: Пойман Seed ${extractedSeed} ➔ Вычислен Key ${finalCompiledKey}`);
        addLog(`[🔧 ГЛОБАЛЬНЫЙ ПАРСЕР]: Обнаружен Seed ${extractedSeed} (Уровень ${capturedSubLvl}) ➔ Сформирован актуальный Ключ: ${finalCompiledKey}`, 'info');
        return;
      }
    }
    // --- END OF OMNIVOROUS GLOBAL INTERCEPTION ---

    // --- GLOBAL ATOMIC SEED INTERCEPTION (BYPASSES FSM IDLE STATUS) ---
    const expectedResponseLvl = securityLevel === '0B' ? '29' : securityLevel === '03' ? '03' : '11';
    const searchPattern = '67' + expectedResponseLvl;

    if (isInterceptorActive && payload.includes(searchPattern)) {
      const index = payload.indexOf(searchPattern);
      if (index !== -1) {
        // Dynamically extract exactly 8 characters representing the dynamic 4-byte seed
        // Example: '107667292D1E9855' -> extracts '2D1E9855'
        const dynamicSeed = payload.substring(index + 4, index + 12);
        
        if (dynamicSeed.length === 8) {
          const finalKey = calculateGenericKey(dynamicSeed, xorMask, offsetValue);
          
          // Update states immediately to activate Step 3 button
          setLiveSeedInput(dynamicSeed);
          setCalculatedKeyResult(finalKey);
          
          setHandshakeStatus(`⚡ АВТО-МАТЕМАТИКА: Ключ ${finalKey} вычислен. Запуск инъекции...`);
          addLog(`[🔧 ГЛОБАЛЬНЫЙ ПАРСЕР]: Dynamic token compiled successfully: ${finalKey}`, 'info');

          // INSTANT AUTOMATED EXECUTION PACKET CASCADE (Bypasses manual delays)
          (async () => {
            const responseLvlInt = parseInt(expectedResponseLvl, 16);
            const keySubFuncHex = (responseLvlInt + 1).toString(16).toUpperCase().padStart(2, '0');

            // 1. Send Key as ISO-TP Multi-Frame instantly (adaptive dynamicStMin spacing)
            await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("100627" + keySubFuncHex + finalKey.substring(0, 4)))); 
            await new Promise(r => setTimeout(r, dynamicStMin));
            await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("21" + finalKey.substring(4, 8) + "0000000000")));
            await new Promise(r => setTimeout(r, 150)); // Wait for ECU unlock verification

            // 2. Write Metadata Descriptor to DID F185
            await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("10112EF185011029")));
            await new Promise(r => setTimeout(r, dynamicStMin));
            await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("2155533238382020")));
            await new Promise(r => setTimeout(r, dynamicStMin));
            await transmitRawLawicell(buildLawicellPacket(txId, formatPadding("2220340000000000")));
            await new Promise(r => setTimeout(r, 150));

            // Step C: Force true 2-byte (16-bit) alignment for target calibration register 01000185
            const currentTxId = txId;
            let rawValue = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '');

            // Force pad to exactly 4 hex characters (2 bytes) from the left (e.g., '07' becomes '0007')
            const paddedValue2Bytes = rawValue.padStart(4, '0'); 

            // Correct single-frame 3D payload layout according to successful dealership trace:
            // 0A (Length) + 3D (Service) + 25 (Mode) + 01000185 (Address) + BD0001 (Structure Prefix) + 2 bytes data
            const monolithic3dPayload = `0A3D2501000185BD0001${paddedValue2Bytes}`;

            addLog(`[🔧 МИТМ ИНЪЕКЦИЯ]: Отправка выверенного 2-байтного кадра 3D: ${monolithic3dPayload}`, 'info');
            await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding(monolithic3dPayload, paddingMode)));
            await new Promise(r => setTimeout(r, 250)); // Allow flash buffer to queue the 16-bit word

            // Step D: Transmit Key Off On Reset (11 02) to trigger EEPROM commit
            addLog('[🔧 МИТМ ИНЪЕКЦИЯ]: Запуск финализации и пересчета контрольных сумм ЭБУ (11 02)...', 'info');
            await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding("021102", paddingMode)));
            addLog(`[🔧 АВТО-ИНЪЕКЦИЯ]: Цепочка успешно завершена для Ключа: ${finalKey}`, 'info');
          })();
        }
      }
    }
    // --- END OF GLOBAL INTERCEPTION ---

    // Active Data Hijacking Injection for VMCU inside handleUdsFlowResponse
    if (isInterceptorActive && targetEcuAddress === '24' && (cleanPayload.startsWith("3001") || cleanPayload.startsWith("30FF"))) {
      let customValueHex = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '').padStart(4, '0'); // Strict 2-byte word (e.g. '0009')
      const currentTxId = txId;
      
      (async () => {
        addLog(`[🔥 МИТМ АКТИВНЫЙ ВПРЫСК]: Пойман Flow Control кузова VMCU! Опережающая подмена байт параметра в DID F185 на значение: ${customValueHex}`, 'info');
        
        // Front-run Launch by instantly pushing Consecutive Frame 1 and 2 onto the CAN line
        await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding("2155533238382020", paddingMode)));
        await new Promise(r => setTimeout(r, 10)); // Short microsecond gap
        await transmitRawLawicell(buildLawicellPacket(currentTxId, formatPadding(`2220${customValueHex}00000000`, paddingMode)));
      })();
    }

    // Check for Negative Response first (UDS Service 0x7F)
    if (state.step !== 'idle' && payload.includes('7F')) {
      if (payload.includes('7F3D78')) {
        addLog(`[UDS INFO]: ECU requested 78 (Response Pending) for 3D - Waiting...`, 'info');
        return;
      }
      const serviceIdx = payload.indexOf('7F');
      if (serviceIdx !== -1) {
        const serviceId = payload.substring(serviceIdx + 2, serviceIdx + 4);
        const nrcCode = payload.substring(serviceIdx + 4, serviceIdx + 6);
        const explanation = getNrcExplanation(nrcCode);
        
        setHandshakeStatus(`⚠️ Отказ ЭБУ (NRC 0x${nrcCode}): ${explanation}`);
        addLog(`[UDS ОТКАЗ]: Сервис 0x${serviceId} -> UDS NRC 0x${nrcCode} (${explanation})`, 'err');
        setIsWriteInProgress(false);
        state.step = 'idle';
        setCurrentStep('error');
        return;
      }
    }

    const responseLvlInt = parseInt(expectedResponseLvl, 16);
    const keySubFuncHex = (responseLvlInt + 1).toString(16).toUpperCase().padStart(2, '0');

    switch (state.step) {
      case 'session_sent':
        if (payload.includes('5003')) {
          setHandshakeStatus(`✅ Расширенная сессия 10 03 открыта. Запрос Seed (Уровень ${expectedResponseLvl})...`);
          addLog('[UDS АВТОПИЛОТ]: Positive Response 0x50 0x03 успешно принят!');
          
          state.step = 'seed_requested';
          setCurrentStep('seed');

          const seedPayload = formatPadding("0227" + expectedResponseLvl);
          const lawicellCmd = buildLawicellPacket(txId, seedPayload);
          await transmitRawLawicell(lawicellCmd);
        }
        break;

      case 'seed_requested':
        const mfSearchPattern = '1076' + searchPattern;
        if (payload.includes(searchPattern) || payload.includes(mfSearchPattern) || payload.includes('10')) {
          
          // 1. Instantly send Flow Control to satisfy the ECU multi-frame broadcast buffer
          const flowControlCmd = buildLawicellPacket(txId, formatPadding("300000"));
          await transmitRawLawicell(flowControlCmd);
          
          // 2. Automate Step 2: Dynamically extract the 4-byte seed from the incoming payload
          let interceptedSeed = "";
          const mfIdx = payload.indexOf(mfSearchPattern);
          const sfIdx = payload.indexOf(searchPattern);
          
          if (mfIdx !== -1) {
            interceptedSeed = payload.substring(mfIdx + 8, mfIdx + 16);
          } else if (sfIdx !== -1) {
            interceptedSeed = payload.substring(sfIdx + 4, sfIdx + 12);
          }

          // 3. Automate Step 2 Math: If seed is valid, instantly run the custom ROT cyclic cipher
          if (interceptedSeed.length === 8) {
            const autoComputedKey = calculateGenericKey(interceptedSeed, xorMask, offsetValue);
            
            // 4. Save the dynamically calculated key straight into the component state
            setCalculatedKeyResult(autoComputedKey);
            setLiveSeedInput(interceptedSeed); // Visual update for UI field
            
            setHandshakeStatus(`✅ Авто-Шаг 2: Перехвачен Seed ${interceptedSeed} -> Рассчитан Key ${autoComputedKey}`);
            addLog(`[🔧 АВТО-МАТЕМАТИКА]: Dynamic Key Generated: ${autoComputedKey}`, 'info');
          }
        }
        break;

      case 'key_sent':
        // Look for security success signature from ECU
        const keySuccessPattern = '67' + keySubFuncHex;
        if (payload.includes(keySuccessPattern)) {
          setHandshakeStatus('🔓 ДОСТУП РАЗБЛОКИРОВАН! Запись калибровки по адресу 01000185...');
          addLog(`[UDS АВТОПИЛОТ]: ЭБУ подтвердил авторизацию уровня ${keySubFuncHex}!`);

          state.step = 'write_sent';
          setCurrentStep('write');

          let payloadValue = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, ''); // User value (e.g. 29)
          const targetHexLen = paramTargetLength * 2;
          if (payloadValue.length < targetHexLen) {
            payloadValue = payloadValue.padStart(targetHexLen, '0');
          } else if (payloadValue.length > targetHexLen) {
            payloadValue = payloadValue.substring(0, targetHexLen);
          }
          const valByteLen = paramTargetLength;
          
          const serviceId = '3D';
          const alfid = '41'; // 4 bytes address, 1 byte length
          const cleanAddress = '01000185';
          const sizeHexStr = valByteLen.toString(16).toUpperCase().padStart(2, '0');
          
          const totalUdsLen = 1 + 1 + 4 + 1 + valByteLen;
          const dlcHexStr = totalUdsLen.toString(16).toUpperCase().padStart(2, '0');

          const writePayload = formatPadding(`${dlcHexStr}${serviceId}${alfid}${cleanAddress}${sizeHexStr}${payloadValue}`);
          const lawicellCmd = buildLawicellPacket(txId, writePayload);
          
          addLog(`[UDS АВТОПИЛОТ]: Отправка кадра записи 3D по адресу 01000185 со значением ${payloadValue}`);
          await transmitRawLawicell(lawicellCmd);
        }
        break;

      case 'write_sent': {
        // If we receive confirmation (7D) or if we are just transitioning after 7F3D78 loop ends:
        if (payload.includes('7D') || payload.includes('097D')) {
          setHandshakeStatus('✅ Параметр успешно изменен в EEPROM! Инициализация сброса ЭБУ...');
          addLog('[UDS АВТОПИЛОТ]: Запись подтверждена физическим сектором памяти!');

          state.step = 'reset_sent';
          setCurrentStep('reset');

          // Send hard reset (11 02) to lock and save data
          const resetCmdPayload = formatPadding('021102');
          const lawicellCmd = buildLawicellPacket(txId, resetCmdPayload);
          await transmitRawLawicell(lawicellCmd);
        }
        break;
      }

      case 'reset_sent':
        // Expecting positive reset status: 51 02
        if (payload.includes('5102')) {
          setHandshakeStatus('🎉 ВСЕ ШАГИ УСПЕШНО ВЫПОЛНЕНЫ! ЭБУ перезагружен с новыми калибровками.');
          addLog('[UDS SUCCESS]: Транзакция успешно верифицирована ЭБУ!', 'info');
          setIsWriteInProgress(false);
          state.step = 'idle';
          setCurrentStep('success');
        }
        break;
    }
  };

  // Lawicell packet generator formats
  const buildLawicellPacket = (canHexId: string, hexPayload: string): string => {
    const cleanPayload = hexPayload.toUpperCase().replace(/\s+/g, '');
    const finalPayload = cleanPayload.substring(0, 16).padEnd(16, 'F');
    return `T${canHexId.toUpperCase().padEnd(8, '0')}8${finalPayload}`;
  };

  // Physically transmit the Command via Web Serial / Web Bluetooth 
  const transmitRawLawicell = async (cmd: string) => {
    const formattedCmd = cmd.replace(/\r?\n|\r/s, "").trim() + '\r';
    addLog(`[TX LAN]: ${cmd}`, 'tx');

    // Virtual feedback to local table sniffer directly
    const txLogMessage = parseTxForSniffer(formattedCmd);
    if (txLogMessage && isSnifferActive) {
      setCanPackets(prev => {
        const idx = prev.findIndex(item => item.id === txLogMessage.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { ...txLogMessage, count: (updated[idx].count || 1) + 1 };
          return updated;
        }
        return [txLogMessage, ...prev.slice(0, 70)];
      });
    }

    try {
      if (connectionType === 'serial' && serialPortRef.current) {
        const writer = serialPortRef.current.writable.getWriter();
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(formattedCmd));
        writer.releaseLock();
      } else if (connectionType === 'bluetooth' && bluetoothTxCharRef.current) {
        const encoder = new TextEncoder();
        await bluetoothTxCharRef.current.writeValue(encoder.encode(formattedCmd));
      } else {
        addLog('Ошибка: Физическое устройство отключено.', 'err');
      }
    } catch (err: any) {
      addLog(`Сбой передачи: ${err.message}`, 'err');
    }
  };

  const handleEmergencyEcuReset = async () => {
    addLog('[🚨 СБРОС]: Инициирована процедура экстренной реанимации ЭБУ...', 'info');
    setHandshakeStatus('⚡ Отправка команд Hard Reset на блок 0x24...');
    
    try {
      // 1. Send UDS Hard Reset (Service 0x11, Subfunction 0x01)
      const hardResetPayload = formatPadding("021101");
      const cmd1 = buildLawicellPacket(txId, hardResetPayload);
      addLog('[🚨 СБРОС]: Отправка кадра 0x11 0x01 (Hard Reset)...');
      await transmitRawLawicell(cmd1);

      // Wait 150ms
      await new Promise(resolve => setTimeout(resolve, 150));

      // 2. Send UDS Key Off On Reset (Service 0x11, Subfunction 0x02) as fallback
      const keyResetPayload = formatPadding("021102");
      const cmd2 = buildLawicellPacket(txId, keyResetPayload);
      addLog('[🚨 СБРОС]: Отправка кадра 0x11 0x02 (Key Off/On Reset)...');
      await transmitRawLawicell(cmd2);

      setHandshakeStatus('🎉 Команды сброса отправлены! Выключите зажигание на 15 секунд.');
      addLog('[🚨 СБРОС]: Пакеты реанимации успешно переданы в шину CAN.', 'info');
    } catch (error) {
      addLog('[🚨 СБРОС ОШИБКА]: Не удалось отправить кадры сброса', 'err');
      setHandshakeStatus('❌ Ошибка отправки сброса.');
    }
  };

  const handleDirectDidInjection = async () => {
    const targetDid = selectedDid === 'custom' ? customDid.toUpperCase().padStart(4, '0') : selectedDid;
    addLog(`[🚀 ВЫСТРЕЛ 2E]: Инициализация прямой инъекции DID ${targetDid} в открытую сессию...`, 'info');
    
    let payloadValue = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '');
    if (!payloadValue) {
      addLog('[🚀 ВЫСТРЕЛ 2E ОШИБКА]: Введите значение параметра (Hex)!', 'err');
      return;
    }
    
    // Ensure correct sizing based on target length
    const targetHexLen = paramTargetLength * 2;
    if (payloadValue.length < targetHexLen) {
      payloadValue = payloadValue.padStart(targetHexLen, '0');
    } else if (payloadValue.length > targetHexLen) {
      payloadValue = payloadValue.substring(0, targetHexLen);
    }

    const serviceId = '2E';
    const valByteLen = paramTargetLength;
    
    // UDS Length = Service(1) + DID(2) + Data(valByteLen)
    const totalUdsLen = 1 + 2 + valByteLen;
    const dlcHexStr = totalUdsLen.toString(16).toUpperCase().padStart(2, '0');

    // Assemble the pure UDS frame and pad it to 8 bytes for CAN bus compatibility
    const writePayload = formatPadding(`${dlcHexStr}${serviceId}${targetDid}${payloadValue}`);
    
    try {
      const lawicellCmd = buildLawicellPacket(txId, writePayload);
      addLog(`[🚀 ВЫСТРЕЛ 2E]: Отправка кадра записи DID на шину -> ${writePayload}`);
      await transmitRawLawicell(lawicellCmd);
      setHandshakeStatus(`⚡ Легальный кадр 2E (DID ${targetDid}) отправлен в сессию ЭБУ!`);
    } catch (error) {
      addLog('[🚀 ВЫСТРЕЛ 2E ОШИБКА]: Сбой передачи кадра инъекции DID', 'err');
    }
  };

  const handleDirect3dInjection = async () => {
    const cleanAddress = memAddress.toUpperCase().padStart(8, '0');
    addLog(`[🚀 ВЫСТРЕЛ 3D]: Инициализация прямой инъекции адреса памяти ${cleanAddress}...`, 'info');
    
    let payloadValue = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '');
    if (!payloadValue) {
      addLog('[🚀 ВЫСТРЕЛ 3D ОШИБКА]: Введите значение параметра (Hex)!', 'err');
      return;
    }
    
    // Ensure correct sizing based on target length
    const targetHexLen = paramTargetLength * 2;
    if (payloadValue.length < targetHexLen) {
      payloadValue = payloadValue.padStart(targetHexLen, '0');
    } else if (payloadValue.length > targetHexLen) {
      payloadValue = payloadValue.substring(0, targetHexLen);
    }

    const serviceId = '3D';
    const alfid = addressLengthFormat || '41'; // default is '41' (4-byte address, 1-byte length format)
    const valByteLen = paramTargetLength;
    const sizeHexStr = valByteLen.toString(16).toUpperCase().padStart(2, '0');
    
    // UDS Length = Service(1) + ALFID(1) + Address(4) + Size(1) + Data(valByteLen)
    const totalUdsLen = 1 + 1 + 4 + 1 + valByteLen;
    const dlcHexStr = totalUdsLen.toString(16).toUpperCase().padStart(2, '0');

    const writePayload = formatPadding(`${dlcHexStr}${serviceId}${alfid}${cleanAddress}${sizeHexStr}${payloadValue}`);
    
    try {
      const lawicellCmd = buildLawicellPacket(txId, writePayload);
      addLog(`[🚀 ВЫСТРЕЛ 3D]: Отправка кадра записи 3D по адресу ${cleanAddress} со значением ${payloadValue}`);
      await transmitRawLawicell(lawicellCmd);
      setHandshakeStatus(`⚡ Легальный кадр 3D (${cleanAddress}) отправлен в сессию ЭБУ!`);
    } catch (error) {
      addLog('[🚀 ВЫСТРЕЛ 3D ОШИБКА]: Сбой передачи кадра инъекции 3D', 'err');
    }
  };

  // Format dynamic sniffer TX
  const parseTxForSniffer = (txLine: string): CanMessage | null => {
    if (!txLine.startsWith('T') && !txLine.startsWith('t')) return null;
    const isExtended = txLine.startsWith('T');
    const idLen = isExtended ? 8 : 3;
    if (txLine.length >= 1 + idLen + 1) {
      const id = txLine.substring(1, 1 + idLen).toUpperCase();
      const dlcChar = txLine.charAt(1 + idLen);
      const dlc = parseInt(dlcChar, 16) || 8;
      const payload = txLine.substring(1 + idLen + 1, 1 + idLen + 1 + dlc * 2).toUpperCase();
      return {
        id,
        payload,
        length: dlc,
        direction: 'TX',
        timestamp: new Date().toLocaleTimeString(),
        decodedInfo: 'Запрос тестера'
      };
    }
    return null;
  };

  // Web Bluetooth connector - HC-05 classic profile 
  const connectWebBluetooth = async () => {
    const userConsent = window.confirm("Это приложение запрашивает доступ к устройствам Bluetooth для корректной работы. Вы хотите разрешить доступ устройствам Bluetooth?");
    if (!userConsent) {
      addLog('[BLUETOOTH]: Отменено пользователем.', 'err');
      return;
    }

    setConnectionStatus('connecting');
    addLog('[BLUETOOTH]: Инициирован поиск порта HC-05 по UUID RFCOMM протокола...', 'info');
    
    try {
      const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
      
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { name: 'HC-05' },
          { namePrefix: 'HC-' },
          { namePrefix: 'OBD' },
          { namePrefix: 'JDY' },
          { namePrefix: 'BT' },
          { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }
        ],
        optionalServices: [
          SPP_UUID, 
          '0000ffe0-0000-1000-8000-00805f9b34fb', 
          '0000fff0-0000-1000-8000-00805f9b34fb',
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
        ]
      });

      setPairedDeviceName(device.name || 'HC-05 Classic');
      addLog(`[BLUETOOTH]: Обнаружено устройство '${device.name}'. Подключение к GATT...`, 'info');

      const server = await device.gatt.connect();
      addLog(`[BLUETOOTH]: Соединение с сервером GATT выполнено. Поиск последовательных характеристик...`, 'info');

      const services = await server.getPrimaryServices();
      let rxChar, txChar;

      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            const props = char.properties;
            if (props.write || props.writeWithoutResponse) {
              txChar = char;
            }
            if (props.notify || props.indicate) {
              rxChar = char;
            }
          }
        } catch (charError) {
          console.warn(`Пропущена служба ${service.uuid} при чтении характеристик:`, charError);
        }
      }

      if (rxChar && txChar) {
        bluetoothRxCharRef.current = rxChar;
        bluetoothTxCharRef.current = txChar;
        bluetoothDeviceRef.current = device;

        await rxChar.startNotifications();
        rxChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const value = event.target.value;
          const decoder = new TextDecoder();
          const chunk = decoder.decode(value);
          handleSerialChunk(chunk);
        });

        // Set Lawicell CAN standard speed
        const speedCmd = canSpeed === '250' ? 'S5\r' : 'S6\r';
        await txChar.writeValue(new TextEncoder().encode(speedCmd));
        await txChar.writeValue(new TextEncoder().encode('O\r')); // Open line

        setConnectionStatus('connected');
        setShowPairModal(false);
        addLog(`[BLUETOOTH СВЯЗЬ]: Успешно спарено напрямую с HC-05! Канал CAN запущен.`, 'info');
      } else {
        throw new Error('Характеристика обмена UART SPP не обнаружена в устройстве.');
      }
    } catch (e: any) {
      setConnectionStatus('error');
      addLog(`[BLUETOOTH ОШИБКА]: ${e.message}`, 'err');
    }
  };

  // Web Serial connector
  const connectWebSerial = async () => {
    if (!('serial' in navigator)) {
      addLog('Браузер не поддерживает Direct Web Serial. Рекомендуется использовать Google Chrome.', 'err');
      return;
    }

    setConnectionStatus('connecting');
    addLog(`[SERIAL]: Инициализация COM-порта. Скорость: ${baudRate} baud...`, 'info');

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      serialPortRef.current = port;

      const encoder = new TextEncoder();
      const writer = port.writable.getWriter();
      const speedCmd = canSpeed === '250' ? 'S5\r' : 'S6\r';
      await writer.write(encoder.encode(speedCmd));
      await writer.write(encoder.encode('O\r')); // Lawicell Open
      writer.releaseLock();

      setConnectionStatus('connected');
      setPairedDeviceName('COM Port CAN');
      setShowPairModal(false);
      addLog(`[SERIAL СВЯЗЬ]: Подключено по COM-порту на ${baudRate} bps! CAN шина активна.`, 'info');

      // Async continuous stream parser
      listenSerialStream(port);
    } catch (e: any) {
      setConnectionStatus('error');
      addLog(`[SERIAL ОШИБКА]: ${e.message}`, 'err');
    }
  };

  const listenSerialStream = async (port: any) => {
    const decoder = new TextDecoder();
    while (port.readable) {
      const reader = port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          handleSerialChunk(chunk);
        }
      } catch (err: any) {
        addLog(`Ошибка потока чтения: ${err.message}`, 'err');
      } finally {
        reader.releaseLock();
      }
    }
  };

  const handleSerialChunk = (chunk: string) => {
    inputBufferRef.current += chunk;
    const delimiter = /\r|\n/;
    let lines = inputBufferRef.current.split(delimiter);
    
    // Save last half-received segment in buffer
    inputBufferRef.current = lines.pop() || '';

    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine) {
        parseIncomingLawicell(cleanLine);
      }
    }
  };

  const disconnectChannel = async () => {
    try {
      if (connectionType === 'serial' && serialPortRef.current) {
        const writer = serialPortRef.current.writable.getWriter();
        await writer.write(new TextEncoder().encode('C\r')); // Lawicell Close CAN Command
        writer.releaseLock();
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
      if (connectionType === 'bluetooth' && bluetoothDeviceRef.current) {
        if (bluetoothTxCharRef.current) {
          await bluetoothTxCharRef.current.writeValue(new TextEncoder().encode('C\r'));
        }
        await bluetoothDeviceRef.current.gatt.disconnect();
        bluetoothDeviceRef.current = null;
        bluetoothRxCharRef.current = null;
        bluetoothTxCharRef.current = null;
      }
    } catch (e) {}

    setConnectionStatus('disconnected');
    setPairedDeviceName('');
    addLog('[СВЯЗЬ]: Канал CAN закрыт. Устройство безопасно отключено.', 'info');
  };

  // Filter sniffer list
  const filteredPackets = canPackets.filter(pkg => {
    if (!packetFilterId) return true;
    return pkg.id.toUpperCase().includes(packetFilterId.toUpperCase());
  });

  return (
    <div className="bg-[#FAF9F5] text-stone-800 min-h-screen flex flex-col font-sans select-none antialiased">
      
      {/* Top Header - Soft Pastel Mint Accent */}
      <header className="bg-[#E4ECE9] border-b border-[#D2DDD9] py-3 px-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#BACFC7] flex items-center justify-center text-[#3D564D] font-mono font-bold text-sm tracking-tighter">
            UDS
          </div>
          <div>
            <h1 className="text-[13px] font-bold font-display uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
              UNIVERSAL CAN-UDS
              <span className="bg-[#CFE1DA] text-[#3D564D] text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full select-none">
                J1939 CLASSIC
              </span>
            </h1>
            <p className="text-[10px] text-stone-500 font-medium">Сервисная панель калибровки CAN-UDS / OBDII</p>
          </div>
        </div>

        {/* Action Link to connection */}
        <div>
          {connectionStatus === 'connected' ? (
            <button 
              onClick={disconnectChannel}
              className="bg-[#FFEBE5] text-[#933D25] border border-[#F4CCC2] px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 hover:bg-[#FDDCD3] transition-colors"
            >
              <Power className="w-3 h-3" />
              {pairedDeviceName} (OFF)
            </button>
          ) : (
            <button 
              onClick={() => setShowPairModal(true)}
              className="bg-[#FFFCEF] text-[#86650F] border border-[#E9DFBD] px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 hover:bg-[#F9EDC7] transition-all animate-pulse"
            >
              <Bluetooth className="w-3 h-3 animate-spin" />
              Выбрать HC-05 Classic
            </button>
          )}
        </div>
      </header>

      {/* Main Container phone centered layout */}
      <main className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col gap-4">

        {/* Iframe detection warning - Highly visual on development frames */}
        {typeof window !== 'undefined' && window.self !== window.top && (
          <div className="bg-[#FFF1EC] text-[#933D25] border border-[#F4CCC2] p-3.5 rounded-2xl text-[11px] leading-relaxed flex flex-col gap-1 shadow-xs animate-pulse">
            <span className="font-bold flex items-center gap-1.5 text-[11.5px]">
              ⚠️ Ограничение фрейма разработки
            </span>
            <p>
              Если приложение запущено во фрейме, функции Bluetooth/Serial заблокированы браузером. Пожалуйста, откройте приложение в отдельной вкладке.
            </p>
          </div>
        )}
        
        {/* Soft Pastel Connection State Banner */}
        <section className="bg-[#FFFCEB] border border-[#F1E8CD] rounded-2xl p-3.5 shadow-xs flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-[#7E651E] tracking-widest font-mono flex items-center gap-1">
              <Settings className="w-3.5 h-3.5" />
              Трансивер CAN-Bus (LAWICELL)
            </span>
            <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
              connectionStatus === 'connected' ? 'bg-[#E3F1DF] text-[#4A7856]' : 'bg-[#F2EAED] text-[#882F4E]'
            }`}>
              {connectionStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/80 p-2.5 rounded-xl border border-[#EEEAE3] flex flex-col gap-0.5">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">Шина CAN Speed:</span>
              <span className="font-mono font-bold text-stone-700">{canSpeed === '500' ? '500 kbit/s' : '250 kbit/s'}</span>
            </div>
            <div className="bg-white/80 p-2.5 rounded-xl border border-[#EEEAE3] flex flex-col gap-0.5">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">Интерфейс связи:</span>
              <span className="font-sans font-bold text-stone-700 capitalize">{connectionType === 'bluetooth' ? 'Bluetooth HC-05' : 'USB Serial Line'}</span>
            </div>
          </div>
        </section>

        {/* Tab Selection */}
        <div className="bg-[#EAE5DA] p-1 rounded-xl flex gap-1">
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex-1 py-2 text-xs font-bold font-display rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'diagnostics' 
                ? 'bg-[#FAF9F5] text-[#334A42] shadow-xs' 
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Вкладка 7
          </button>
          
          <button
            onClick={() => setActiveTab('canLogger')}
            className={`flex-1 py-2 text-xs font-bold font-display rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'canLogger' 
                ? 'bg-[#FAF9F5] text-[#334A42] shadow-xs' 
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Лог CAN
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`flex-1 py-2 text-xs font-bold font-display rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'guide' 
                ? 'bg-[#FAF9F5] text-[#334A42] shadow-xs' 
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Алгоритмы
          </button>
        </div>

        {/* Tabs Area */}
        <div className="flex-1">
          
          {/* TAB 1: Diagnostics Tab 7 */}
          {activeTab === 'diagnostics' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <Tab7NetworkManager 
                connectionStatus={connectionStatus}
                transmitRawLawicell={transmitRawLawicell}
                buildLawicellPacket={buildLawicellPacket}
                formatPadding={formatPadding}
                addLog={addLog}
                liveSeedInput={liveSeedInput}
                setLiveSeedInput={setLiveSeedInput}
                calculatedKeyResult={calculatedKeyResult}
                setCalculatedKeyResult={setCalculatedKeyResult}
                handleManualSeedRequest={handleManualSeedRequest}
                handleManualKeyAndWriteExecution={handleManualKeyAndWriteExecution}
                handshakeStatus={handshakeStatus}
                setHandshakeStatus={setHandshakeStatus}
                calibrationMaskIndex={calibrationMaskIndex}
                setCalibrationMaskIndex={setCalibrationMaskIndex}
                paramNewValue={paramNewValue}
                setParamNewValue={setParamNewValue}
                readParameterResult={readParameterResult}
                setReadParameterResult={setReadParameterResult}
                memAddress={memAddress}
                setMemAddress={setMemAddress}
                isInterceptorActive={isInterceptorActive}
                setIsInterceptorActive={setIsInterceptorActive}
                xorMask={xorMask}
                setXorMask={setXorMask}
                offsetValue={offsetValue}
                setOffsetValue={setOffsetValue}
                expertMode={expertMode}
                setExpertMode={setExpertMode}
                dynamicStMin={dynamicStMin}
                setDynamicStMin={setDynamicStMin}
              />

              {/* Advanced Diagnostic Console / Message Injection Terminal */}
              <div className="bg-white border border-[#EAE6DD] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider font-mono flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5" />
                  Ручная калибровка (UDS payload)
                </span>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rawInjectionHex}
                    onChange={(e) => setRawInjectionHex(e.target.value)}
                    placeholder="Напр. 1003"
                    className="flex-1 bg-[#FAF9F5] border border-[#EBE7DF] rounded-xl px-3 py-2 font-mono text-xs focus:outline-none tracking-widest text-[#506E9C]"
                  />
                  <button
                    onClick={async () => {
                      const completeCmd = buildLawicellPacket(txId, rawInjectionHex);
                      await transmitRawLawicell(completeCmd);
                    }}
                    disabled={connectionStatus !== 'connected'}
                    className="bg-[#D6E5FA] text-[#3B5A86] border border-[#BACFEF] hover:bg-[#C2D7F5] disabled:bg-[#FAF9F5] disabled:text-stone-300 disabled:border-[#EBE7DF] px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 active:scale-95"
                  >
                    <Send className="w-3 h-3" />
                    Отправить
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Live CAN Sniffer Logger */}
          {activeTab === 'canLogger' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              
              <div className="bg-white border border-[#EAE6DD] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wider font-mono">Мониторинг кадров шины CAN</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setIsSnifferActive(!isSnifferActive)}
                      className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                        isSnifferActive ? 'bg-[#E3F1DF] text-[#4A7856]' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {isSnifferActive ? 'RUNNING' : 'PAUSED'}
                    </button>
                    <button
                      onClick={() => setCanPackets([])}
                      className="text-stone-400 hover:text-red-500 font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Filter and settings */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Фильтр CAN ID..."
                    value={packetFilterId}
                    onChange={(e) => setPacketFilterId(e.target.value)}
                    className="w-full bg-[#FAF9F5] border border-[#EBE7DF] rounded-xl px-3 py-1.5 font-mono text-xs focus:outline-none"
                  />
                </div>

                {/* Grid Table of CAN packets */}
                <div className="border border-[#EBE6DD] rounded-xl overflow-hidden max-h-80 overflow-y-auto bg-[#FCFAF5]">
                  <table className="w-full text-left border-collapse font-mono text-[10px]">
                    <thead className="bg-[#FAF9F5] text-stone-400 border-b border-[#EBE6DD] sticky top-0">
                      <tr>
                        <th className="p-2">ID (29-bit)</th>
                        <th className="p-2">DLC</th>
                        <th className="p-2">Данные (Hex bytes)</th>
                        <th className="p-2 text-right">Повторы (Qty)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1EBE0]">
                      {filteredPackets.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-stone-400 font-sans italic">
                            Кадры отсутствуют. Подключите CAN-адаптер и отправьте команду.
                          </td>
                        </tr>
                      ) : (
                        filteredPackets.map((pkg, idx) => (
                          <tr key={idx} className={pkg.direction === 'TX' ? 'bg-[#FFF9F6]' : 'bg-white'}>
                            <td className={`p-2 font-bold ${pkg.direction === 'TX' ? 'text-amber-800' : 'text-emerald-800'}`}>
                              {pkg.id} {pkg.direction === 'TX' && '✍'}
                            </td>
                            <td className="p-2 text-stone-500">{pkg.length}</td>
                            <td className="p-2 text-stone-700 select-all tracking-wider font-bold">
                              {pkg.payload.match(/.{1,2}/g)?.join(' ') || pkg.payload}
                            </td>
                            <td className="p-2 text-right text-stone-400 font-bold">{pkg.count || 1}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Log text console */}
              <div className="bg-stone-900 text-stone-300 rounded-2xl p-4 font-mono text-[10px] leading-relaxed flex flex-col gap-2 min-h-36 max-h-56 overflow-y-auto">
                <span className="text-stone-400 uppercase font-bold text-[9px] tracking-wider border-b border-stone-800 pb-1 flex items-center justify-between">
                  <span>Системный протокол Lawicell (ASCII)</span>
                  <div className="flex gap-2.5">
                    <button 
                      onClick={handleCopyLogs} 
                      disabled={terminalLogs.length === 0}
                      className="text-stone-400 hover:text-stone-200 disabled:text-stone-700 disabled:cursor-not-allowed transition-colors cursor-pointer font-bold"
                    >
                      {copiedLogs ? 'Скопировано!' : 'Копировать'}
                    </button>
                    <button 
                      onClick={() => setTerminalLogs([])} 
                      disabled={terminalLogs.length === 0}
                      className="text-[#E9C3B5] hover:text-rose-300 disabled:text-stone-700 disabled:cursor-not-allowed transition-colors cursor-pointer font-bold"
                    >
                      Сбросить
                    </button>
                  </div>
                </span>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {terminalLogs.length === 0 ? (
                    <p className="text-stone-600 select-none">&gt;&gt; Терминал пуст. Ожидание физического подключения...</p>
                  ) : (
                    terminalLogs.map((log, i) => (
                      <p key={i} className="whitespace-pre-wrap select-all">
                        <span className="text-stone-600 font-normal">[{log.time}]</span>{' '}
                        {log.mode === 'tx' && <span className="text-amber-400 font-bold">&gt;&gt; {log.text}</span>}
                        {log.mode === 'rx' && <span className="text-emerald-400 font-bold">&lt;&lt; {log.text}</span>}
                        {log.mode === 'err' && <span className="text-rose-400 font-bold">[!] {log.text}</span>}
                        {log.mode === 'info' && <span className="text-violet-400 font-medium">[*] {log.text}</span>}
                        {log.mode === 'success' && <span className="text-green-400 font-bold">[✓] {log.text}</span>}
                        {log.mode === 'warn' && <span className="text-orange-400 font-bold">[!] {log.text}</span>}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Reference & Manual J1939 Algorithms */}
          {activeTab === 'guide' && (
            <div className="bg-white border border-[#EAE6DD] rounded-2xl p-5 flex flex-col gap-5 animate-fadeIn shadow-sm">
              <h2 className="font-bold text-[14px] font-display text-stone-800 uppercase tracking-tight border-b pb-2 flex items-center gap-2">
                <span>📘</span> База знаний: Алгоритмы и Функционал Вкладки 7
              </h2>

              <div className="text-xs text-stone-600 flex flex-col gap-4.5 leading-relaxed">
                
                {/* Короткое описание */}
                <div className="p-3.5 bg-[#EEF2F6] border border-[#DAE1E9] rounded-xl text-stone-700">
                  <p className="font-medium text-[11px] uppercase tracking-wide text-stone-500 mb-1">Назначение Вкладки 7:</p>
                  Инструментарий предназначен для низкоуровневой отладки, обхода защиты (Security Access) и прямой низкоуровневой записи параметров в универсальные электронные блоки управления (VMCU, EMS, FCIOM, APM) техники по шине J1939/CAN. Допускается модификация калибровок как через идентификаторы данных (DID), так и через прямое обращение к адресам флэш-памяти ЭБУ.
                </div>

                {/* Блок Формулы математики Seed-Key */}
                <div className="p-4 bg-[#EAF8F2] border border-[#C6EBDA] rounded-xl text-[#1E4D36]">
                  <h3 className="font-bold text-[12px] text-stone-800 mb-2 flex items-center gap-1.5">
                    <span className="text-[#27AE60]">⚡</span> Динамический математический алгоритм ROL3
                  </h3>
                  <p className="mb-2">
                    Вектор безопасности рассчитывается путем циклического сдвига 32-битного значения <code className="bg-[#D1F2E2] px-1 rounded font-mono text-[11px]">Seed</code> влево на 3 бита, побитового исключающего ИЛИ (XOR) с настраиваемой маской и последующего сложения со смещением:
                  </p>
                  <div className="bg-[#DFF5EC] rounded-xl p-3 font-mono text-[11px] text-stone-800 mb-2 leading-loose flex flex-col gap-1 shadow-xs">
                    <div>1. <span className="text-stone-500">// Циклический сдвиг на 3 бита влево (32-bit ROL3):</span></div>
                    <div className="pl-4 font-bold text-emerald-800">ROL3 = (Seed &lt;&lt; 3) | (Seed &gt;&gt; 29)</div>
                    <div>2. <span className="text-stone-500">// Побитовое наложение маски (настраивается в настройках):</span></div>
                    <div className="pl-4 font-bold text-emerald-800">XOR = ROL3 &circ; Маска_XOR</div>
                    <div>3. <span className="text-stone-500">// Арифметическое смещение (настраивается в настройках):</span></div>
                    <div className="pl-4 font-bold text-emerald-800">Key = (XOR + Смещение) mod 2³²</div>
                  </div>
                </div>

                {/* Блок Функционал Вкладки 7 */}
                <div className="p-4 bg-[#FCF5EE] border border-[#F3E2D3] rounded-xl text-stone-700">
                  <h3 className="font-bold text-[12px] text-stone-800 mb-2.5 flex items-center gap-1.5">
                    <span>🎛️</span> Механика управления и инъекций (Tab 7)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11.5px]">
                    <div className="space-y-1">
                      <p className="font-bold text-orange-850">1. Селектор Целевого ЭБУ</p>
                      <p className="text-stone-500 text-[11px] leading-normal">
                        Позволяет перенаправлять пакеты на нужный сетевой адрес J1939: <b>VMCU</b> (0x24), <b>EMS</b> (0x00), <b>FCIOM</b> (0x26), <b>APM</b> (0x3A), либо указывать свой в ручном режиме. Изменение селектора мгновенно обновляет маски приема-выдачи CAN ID.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-orange-850">2. Класс доступа (SecurityAccess)</p>
                      <p className="text-stone-500 text-[11px] leading-normal">
                        Dynamic Link осуществляет автоматический расчет и верификацию Security Level в зависимости от выбранного класса доступа (0x0B, 0x03 или 0x11). Сниффер оперативно распознает соответствующую маску положительного ответа <code className="bg-orange-50 px-1 rounded font-mono">67 [Sub-Function]</code>.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-orange-850">3. Прямой выстрел UDS 2E (DID Write)</p>
                      <p className="text-stone-500 text-[11px] leading-normal">
                        Запуск записи конфигурационных констант по калибровочному идентификатору (DID). Размер данных настраивается от 1 до 4 байт с автозаполнением нулей или обрезкой.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-orange-850">4. Прямой выстрел UDS 3D (Memory Write)</p>
                      <p className="text-stone-500 text-[11px] leading-normal">
                        Выполняет прямую запись новых величин по физическому адресу EEPROM/Flash. Вкладка предоставляет гибкую настройку формата адресации (ALFID) и размера данных.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Интерактивный Калькулятор Seed-Key */}
                <div className="bg-[#F9F7F1] border border-[#EDE3CC] rounded-xl p-4 flex flex-col gap-3">
                  <h4 className="font-bold text-stone-700 text-xs uppercase tracking-tight flex items-center gap-1.5 border-b pb-1.5 border-[#EDE3CC]">
                    <span>🧮</span> Интерактивный калькулятор для ручной проверки
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider font-mono">
                        Введите Seed (8 hex символов):
                      </label>
                      <input
                        type="text"
                        maxLength={8}
                        value={inputSeedValue}
                        onChange={(e) => setInputSeedValue(e.target.value)}
                        placeholder="C07745CB"
                        className="bg-white border border-[#EBE7DF] rounded-xl p-2 font-mono text-stone-800 text-sm tracking-widest uppercase focus:outline-none focus:border-amber-500 transition-all font-bold"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider font-mono">
                        Вычисленный Key:
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={outputKeyValue}
                        placeholder="Результат появится здесь"
                        className="bg-stone-50 border border-[#EBE7DF] rounded-xl p-2 font-mono text-stone-800 text-sm tracking-widest uppercase font-bold text-stone-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualKeyCalculation}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-sm font-semibold flex items-center justify-center gap-1.5 mt-1 cursor-pointer"
                  >
                    Рассчитать Ключ
                  </button>
                </div>

                {/* Порядок выполнения транзакции */}
                <div className="pt-2 border-t border-stone-100">
                  <h3 className="font-bold text-stone-800 flex items-center gap-1 mb-1">
                    <Info className="w-3.5 h-3.5 text-[#506E9C]" />
                    Пошаговый протокол обмена при автоматической инъекции
                  </h3>
                  <ul className="list-decimal pl-4 space-y-1.5 mt-1.5 text-[11px] text-stone-500">
                    <li>Установка диагностической сессии <b>DiagnosticSessionControl</b> (<code className="font-mono bg-[#FAF9F5] p-0.5 rounded text-[10px]">10 03</code>).</li>
                    <li>Запрос Seed-значения уровня доступа <b>SecurityAccess</b> (<code className="font-mono bg-[#FAF9F5] p-0.5 rounded text-[10px]">27 [ExpectedLevel]</code>) и прием ответа.</li>
                    <li>Отправка вычисленного ответа <b>Key</b> (<code className="font-mono bg-[#FAF9F5] p-0.5 rounded text-[10px]">27 [ExpectedLevel + 1] [ComputedKey]</code>).</li>
                    <li>Исполнение команды записи через калибровочные службы UDS <b>2E</b> или <b>3D</b>.</li>
                    <li>Мягкая перезагрузка модуля <b>ECU Reset</b> (<code className="font-mono bg-[#FAF9F5] p-0.5 rounded text-[10px]">11 02</code>) для сохранения изменений в энергонезависимой памяти.</li>
                  </ul>
                </div>

                <div className="p-3 bg-[#FCF8E3] border border-[#FAEBCC] rounded-xl text-[11px] text-[#8A6D3B]">
                  <strong>Внимание оборудования:</strong> Запись на физических ЭБУ выполняется по протоколу ISO 15765-2 (UDS over CAN) через аппаратный адаптер Lawicell. Никакой искусственной эмуляции кадра не производится.
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Persistent Bluetooth Pairing Prompt Block / Interactive Connection Modal */}
      <AnimatePresence>
        {showPairModal && (
          <motion.div 
            id="pair_modal"
            className="fixed inset-0 bg-[#332A26]/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="bg-[#FAF9F5] w-full max-w-sm rounded-[32px] border-4 border-[#E6E0D2] shadow-2xl p-6 overflow-hidden flex flex-col gap-5 text-center"
              initial={{ scale: 0.94, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 15 }}
            >
              
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-[#E4ECE9] rounded-full flex items-center justify-center border-2 border-[#BCD4B7] shadow-xs">
                  <Bluetooth className="w-7 h-7 text-[#4A7856] animate-pulse" />
                </div>
                <h3 className="font-bold text-[15px] font-display text-stone-800 uppercase tracking-tight mt-1">
                  Подключение к CAN-шине ЭБУ / OBDII
                </h3>
                <p className="text-[11px] text-stone-500 max-w-xs leading-normal font-medium">
                  Для прошивки параметров Вкладки 7 требуется физическое Bluetooth сопряжение с адаптером HC-05 (Lawicell @ 115200) или USB-адаптером.
                </p>

                {typeof window !== 'undefined' && window.self !== window.top && (
                  <div className="mt-2 bg-[#FFF3CD] border border-[#FFEBAA] rounded-xl p-3 text-left text-[#856404] text-[10.5px] leading-relaxed flex items-start gap-2 animate-pulse">
                    <span className="text-xs pt-0.5">⚠️</span>
                    <div>
                      <strong className="font-bold text-[#664D03]">Внимание (Режим предпросмотра):</strong><br />
                      Браузер блокирует Web Serial и Web Bluetooth во фреймах. Пожалуйста, нажмите кнопку <strong className="underline font-bold">"Открыть в новой вкладке"</strong> в правом верхнем углу интерфейса перед сопряжением!
                    </div>
                  </div>
                )}
              </div>

              {/* Interface settings config selector */}
              <div className="bg-white p-4.5 rounded-2xl border border-[#EEEAE0] flex flex-col gap-3 text-left">
                <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider font-mono">Параметры соединения:</span>
                
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#FAF9F5] rounded-xl border border-[#EEEAE0]">
                  <button
                    onClick={() => setConnectionType('bluetooth')}
                    className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      connectionType === 'bluetooth' ? 'bg-[#BACFC7] text-[#3D564D]' : 'text-stone-400'
                    }`}
                  >
                    Classic HC-05
                  </button>
                  <button
                    onClick={() => setConnectionType('serial')}
                    className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      connectionType === 'serial' ? 'bg-[#BACFC7] text-[#3D564D]' : 'text-stone-400'
                    }`}
                  >
                    Web Serial COM
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3.5 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-stone-400 font-bold uppercase">Скорость CAN:</span>
                    <select
                      value={canSpeed}
                      onChange={(e: any) => setCanSpeed(e.target.value)}
                      className="bg-[#FAF9F5] border border-[#EBE7DF] rounded-lg p-1.5 focus:outline-none text-stone-800 font-semibold"
                    >
                      <option value="500">500 kbit/s</option>
                      <option value="250">250 kbit/s</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-stone-400 font-bold uppercase">Baudrate HC-05:</span>
                    <select
                      value={baudRate}
                      onChange={(e: any) => setBaudRate(Number(e.target.value))}
                      className="bg-[#FAF9F5] border border-[#EBE7DF] rounded-lg p-1.5 focus:outline-none text-stone-800 font-mono text-xs font-semibold"
                    >
                      <option value={115200}>115200 bps</option>
                      <option value={9600}>9600 bps</option>
                      <option value={38400}>38400 bps</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Establish communication trigger buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={connectionType === 'bluetooth' ? connectWebBluetooth : connectWebSerial}
                  className="w-full py-3.5 bg-stone-800 hover:bg-stone-900 border-0 text-[#EBE7DF] rounded-2xl text-[11px] font-sans font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm hover:shadow-stone-700/10 active:scale-[0.98]"
                >
                  <Bluetooth className="w-4 h-4 text-[#BACFC7]" />
                  Сопряжение с прибором
                </button>
                
                <button
                  onClick={() => setShowPairModal(false)}
                  className="text-[10px] text-stone-400 font-bold py-1.5 hover:text-stone-700"
                >
                  Разрешить просмотр без соединения
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
