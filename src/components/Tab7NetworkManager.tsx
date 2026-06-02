import React, { useState, useEffect, useRef } from 'react';
import { Sliders, Settings, AlertTriangle, ShieldCheck, Heart, Info, RefreshCw, Cpu, HelpCircle, BookOpen, CheckCircle2 } from 'lucide-react';

const getUdsKeyLevel = (seedLevelHex: string): string => {
  try {
    const seedVal = parseInt(seedLevelHex, 16) || 0;
    const keyVal = (seedVal + 1) & 0xFF;
    return keyVal.toString(16).toUpperCase().padStart(2, '0');
  } catch (e) {
    return '2A';
  }
};

interface UdsAccessPreset {
  name: string;
  session: string;
  secLevel: string;
  description: string;
  detailedInfo: string;
}

const UDS_ACCESS_PRESETS: Record<string, UdsAccessPreset> = {
  engineering: {
    name: 'Инженерный Flash (10 03 + 27 29)',
    session: '03',
    secLevel: '29',
    description: 'Для прямой перезаписи EEPROM/Flash.',
    detailedInfo: 'Рекомендуемые параметры:\n• Сессия: 0x03 (Extended Diagnostic Session)\n• Уровень Seed: 0x29 (Flash Writing Access)\n• Уровень Key: 0x2A (Calculated response)\n• Назначение: Чтение и инъекция калибровочных данных.'
  },
  dealership: {
    name: 'Дилерское кодирование (10 02 + 27 03)',
    session: '02',
    secLevel: '03',
    description: 'Для изменения комплектаций и кодирования.',
    detailedInfo: 'Рекомендуемые параметры:\n• Сессия: 0x02 (Programming Session)\n• Уровень Seed: 0x03 (Dealership Access)\n• Уровень Key: 0x04\n• Назначение: Авторизация кодирования по дилерскому протоколу.'
  },
  diagnostics: {
    name: 'Сервисные тесты (10 03 + 27 01)',
    session: '03',
    secLevel: '01',
    description: 'Для тестов исполнительных механизмов.',
    detailedInfo: 'Рекомендуемые параметры:\n• Сессия: 0x03 (Extended Diagnostic Session)\n• Уровень Seed: 0x01 (Standard Service Access)\n• Уровень Key: 0x02\n• Назначение: Прохождение базовых тестов и чтение закрытых RID параметров.'
  }
};

interface EcuPresetProfile {
  name: string;
  codename: string;
  addressHex: string;
  txId: number;
  rxId: number;
  did: string;
  stMin: number;
  math: 'rot3_endian_swap' | 'rot3_xor_offset';
  consecutiveMode: '17_launch' | '38_legacy';
  description: string;
  detailedInfo: string;
  defaultVal: string;
}

const ECU_PRESET_PROFILES: Record<string, EcuPresetProfile> = {
  vmcu: {
    name: 'VMCU кузов',
    codename: 'Volvo VMCU 0x24',
    addressHex: '01000185',
    txId: 0x18DA24F2,
    rxId: 0x18DAF224,
    did: 'F185',
    stMin: 25,
    math: 'rot3_endian_swap',
    consecutiveMode: '17_launch',
    description: 'Основной блок кузовной электроники грузовика.',
    detailedInfo: 'Рекомендуемые параметры:\n• Адрес: 0x24 (VMCU)\n• TX ID: 18DA24F2\n• RX ID: 18DAF224\n• Предельный DID: F185\n• Оптимальный STmin: 25 мс\n• Алгоритм Key: Endian Swap\n• Формат кадров: 17B (Launch Standard)',
    defaultVal: '5A' // 90 dec
  },
  ems: {
    name: 'EMS мотор',
    codename: 'Volvo EMS 0x00',
    addressHex: '01020304',
    txId: 0x18DA00F2,
    rxId: 0x18DAF200,
    did: '1ABE',
    stMin: 15,
    math: 'rot3_endian_swap',
    consecutiveMode: '17_launch',
    description: 'Блок управления впрыском и ограничителями двигателя.',
    detailedInfo: 'Рекомендуемые параметры:\n• Адрес: 0x00 (EMS / Двигатель)\n• TX ID: 18DA00F2\n• RX ID: 18DAF200\n• Предельный DID: 1ABE\n• Оптимальный STmin: 15 мс\n• Алгоритм Key: Endian Swap\n• Формат кадров: 17B (Launch Standard)',
    defaultVal: '41' // 65 dec
  },
  fciom: {
    name: 'FCIOM рама',
    codename: 'Volvo FCIOM 0x26',
    addressHex: '0100C102',
    txId: 0x18DA26F2,
    rxId: 0x18DAF226,
    did: 'C102',
    stMin: 20,
    math: 'rot3_endian_swap',
    consecutiveMode: '17_launch',
    description: 'Передний модуль шасси (коробка отбора мощности PTO).',
    detailedInfo: 'Рекомендуемые параметры:\n• Адрес: 0x26 (FCIOM / Шасси перед)\n• TX ID: 18DA26F2\n• RX ID: 18DAF226\n• Предельный DID: C102\n• Оптимальный STmin: 20 мс\n• Алгоритм Key: Endian Swap\n• Формат кадров: 17B',
    defaultVal: '32' // 50 dec
  },
  apm: {
    name: 'APM тормоза',
    codename: 'Volvo APM 0x3A',
    addressHex: '0100D140',
    txId: 0x18DA3AF2,
    rxId: 0x18DAF23A,
    did: 'D140',
    stMin: 30,
    math: 'rot3_endian_swap',
    consecutiveMode: '17_launch',
    description: 'Система подготовки сжатого воздуха и осушителя.',
    detailedInfo: 'Рекомендуемые параметры:\n• Адрес: 0x3A (APM / Модулятор тормозов)\n• TX ID: 18DA3AF2\n• RX ID: 18DAF23A\n• Предельный DID: D140\n• Оптимальный STmin: 30 мс\n• Алгоритм Key: Endian Swap\n• Формат кадров: 17B',
    defaultVal: '64' // 100 dec
  }
};

interface Tab7NetworkManagerProps {
  connectionStatus: string;
  transmitRawLawicell: (cmd: string) => Promise<any>;
  buildLawicellPacket: (id: string, payload: string) => string;
  formatPadding: (payload: string, mode?: 'AA' | '00' | 'none') => string;
  addLog: (text: string, mode?: 'info' | 'tx' | 'rx' | 'err' | 'success' | 'warn') => void;
  liveSeedInput: string;
  setLiveSeedInput: React.Dispatch<React.SetStateAction<string>>;
  calculatedKeyResult: string;
  setCalculatedKeyResult: React.Dispatch<React.SetStateAction<string>>;
  handleManualSeedRequest: () => Promise<void>;
  handleManualKeyAndWriteExecution: () => Promise<void>;
  handshakeStatus: string;
  setHandshakeStatus: React.Dispatch<React.SetStateAction<string>>;
  calibrationMaskIndex: string;
  setCalibrationMaskIndex: (val: string) => void;
  paramNewValue: string;
  setParamNewValue: React.Dispatch<React.SetStateAction<string>>;
  readParameterResult: string;
  setReadParameterResult: React.Dispatch<React.SetStateAction<string>>;
  memAddress: string;
  setMemAddress: (val: string) => void;
  isInterceptorActive: boolean;
  setIsInterceptorActive: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Custom Settings props passed from App
  xorMask: string;
  setXorMask: (val: string) => void;
  offsetValue: string;
  setOffsetValue: (val: string) => void;
  expertMode: boolean;
  setExpertMode: (val: boolean) => void;
  dynamicStMin: number;
  setDynamicStMin: (val: number) => void;
}

export default function Tab7NetworkManager({
  connectionStatus,
  transmitRawLawicell: parentTransmitRawLawicell,
  calculatedKeyResult: parentCalculatedKeyResult,
  setCalculatedKeyResult: parentSetCalculatedKeyResult,
  addLog: parentAddLog,
  paramNewValue: parentParamNewValue,
  setParamNewValue: parentSetParamNewValue,
  xorMask,
  setXorMask,
  offsetValue,
  setOffsetValue,
  expertMode,
  setExpertMode,
  dynamicStMin,
  setDynamicStMin
}: Tab7NetworkManagerProps) {
  // Local constants and IDs - Now fully customizable & dynamic
  const [currentTxId, setCurrentTxId] = useState<number>(0x18DA24F2);
  const [currentRxId, setCurrentRxId] = useState<number>(0x18DAF224);
  const [targetAddressHex, setTargetAddressHex] = useState<string>("01000185"); // Target parameter address register alignment
  const [paramNewValue, setParamNewValue] = useState<string>(parentParamNewValue || "3C"); // Preset Payload HEX byte
  const [stMinInterval, setStMinInterval] = useState<number>(25); // Separation wait step (STmin)
  
  const [calculatedKeyResult, setCalculatedKeyResult] = useState<string>("");
  const [flowControlState, setFlowControlState] = useState<'IDLE' | 'WAITING_FOR_READY' | 'READY_TO_SEND' | 'OVERFLOW'>('IDLE');
  
  // Mathematical algorithm selection for the Seed-Key calculation
  const [mathFormula, setMathFormula] = useState<'rot3_xor_offset' | 'rot3_endian_swap'>('rot3_endian_swap');

  // Currently active preset profile indicator
  const [selectedPresetProfile, setSelectedPresetProfile] = useState<string>('vmcu');
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Local validation helper properties
  const [selectedDidType, setSelectedDidType] = useState<string>('F185'); // default to Speed Limit DID for interactive limit checking

  // Termination Action selected by the user
  const [terminationAction, setTerminationAction] = useState<'1001' | '1102'>(() => (localStorage.getItem('uds_termination_action') as '1001' | '1102') || '1001');

  const [udsSessionType, setUdsSessionType] = useState<string>(() => localStorage.getItem('uds_tab7_session_type') || '03');
  const [udsSecurityLevel, setUdsSecurityLevel] = useState<string>(() => localStorage.getItem('uds_tab7_sec_level') || '29');
  const [selectedUdsPreset, setSelectedUdsPreset] = useState<string>(() => localStorage.getItem('uds_selected_preset') || 'engineering');
  const [activeUdsTooltip, setActiveUdsTooltip] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('uds_termination_action', terminationAction);
  }, [terminationAction]);

  useEffect(() => {
    localStorage.setItem('uds_tab7_session_type', udsSessionType);
  }, [udsSessionType]);

  useEffect(() => {
    localStorage.setItem('uds_tab7_sec_level', udsSecurityLevel);
  }, [udsSecurityLevel]);

  useEffect(() => {
    localStorage.setItem('uds_selected_preset', selectedUdsPreset);
  }, [selectedUdsPreset]);

  // Track state in refs for async routines
  const fcStateRef = useRef<string>('IDLE');
  const payloadValueRef = useRef<string>("3C");
  const stMinRef = useRef<number>(25);
  const txIdRef = useRef<number>(0x18DA24F2);

  // Consecutive frames inputs to edit bytes layout freely
  const [frame21Input, setFrame21Input] = useState<string>("55533238382020");
  const [frame22Input, setFrame22Input] = useState<string>("32303236303630");
  const [frame23Input, setFrame23Input] = useState<string>("32000000000000");
  const [frame24Input, setFrame24Input] = useState<string>("AAAAAAAAAAAAAAAA");
  const [frame25Input, setFrame25Input] = useState<string>("AAAAAAAAAAAAAAAA");
  const [writePreset, setWritePreset] = useState<'17_launch' | '38_legacy'>('17_launch');

  // Select preset and populate fields
  const selectPreset = (type: '17_launch' | '38_legacy') => {
    setWritePreset(type);
    if (type === '17_launch') {
      setFrame21Input("55533238382020"); // "US288  "
      let pureVal = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '').substring(0, 2) || "3C";
      setFrame22Input(`20${pureVal}0000000000`); // " " + speed limit
      setFrame23Input("AAAAAAAAAAAAAAAA");
      setFrame24Input("AAAAAAAAAAAAAAAA");
      setFrame25Input("AAAAAAAAAAAAAAAA");
    } else {
      setFrame21Input("322B0101323333");
      let pureVal = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '').substring(0, 2) || "3C";
      setFrame22Input(`20${pureVal}3431323536`);
      setFrame23Input("35363431323536");
      setFrame24Input("35372431AAAAAAAA");
      setFrame25Input("AAAAAAAAAAAAAAAA");
    }
  };

  // Keep frame 22 input automatically in sync with the paramNewValue DID speed parameter
  useEffect(() => {
    if (writePreset === '38_legacy') {
      let pureVal = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '').substring(0, 2) || "3C";
      setFrame22Input(`20${pureVal}3431323536`);
    } else if (writePreset === '17_launch') {
      let pureVal = paramNewValue.toUpperCase().replace(/[^0-9A-Fa-f]/g, '').substring(0, 2) || "3C";
      setFrame22Input(`20${pureVal}0000000000`);
    }
  }, [paramNewValue, writePreset]);

  const frame21Ref = useRef<string>("55533238382020");
  const frame22Ref = useRef<string>("203C0000000000");
  const frame23Ref = useRef<string>("AAAAAAAAAAAAAAAA");
  const frame24Ref = useRef<string>("AAAAAAAAAAAAAAAA");
  const frame25Ref = useRef<string>("AAAAAAAAAAAAAAAA");

  useEffect(() => { fcStateRef.current = flowControlState; }, [flowControlState]);
  useEffect(() => { payloadValueRef.current = paramNewValue; }, [paramNewValue]);
  useEffect(() => { stMinRef.current = stMinInterval; }, [stMinInterval]);
  useEffect(() => { txIdRef.current = currentTxId; }, [currentTxId]);

  // Apply chosen ECU configuration with correct defaults & bounds safe-guards
  const handleSelectEcuPreset = (presetKey: string) => {
    const preset = ECU_PRESET_PROFILES[presetKey];
    if (!preset) return;

    setSelectedPresetProfile(presetKey);
    setCurrentTxId(preset.txId);
    setCurrentRxId(preset.rxId);
    setTargetAddressHex(preset.addressHex);
    setSelectedDidType(preset.did);
    setStMinInterval(preset.stMin);
    setDynamicStMin(preset.stMin); // synchronize to parent App state
    setMathFormula(preset.math);
    setWritePreset(preset.consecutiveMode);
    
    // Auto-select corresponding session & level for these deep ECUs
    setUdsSessionType('03');
    setUdsSecurityLevel('29');
    setSelectedUdsPreset('engineering');
    
    // Safety check limit setting update
    setParamNewValue(preset.defaultVal);
    parentSetParamNewValue(preset.defaultVal);

    if (parentAddLog) {
      parentAddLog(`[🔧 ПРЕСЕТ ЭБУ]: Применен профиль ${preset.name}. TX: ${preset.txId.toString(16).toUpperCase()}, RX: ${preset.rxId.toString(16).toUpperCase()}, DID: ${preset.did}, STmin: ${preset.stMin}мс (Сессия 10 03 / Доступ 27 29).`, 'success');
    }
  };
  useEffect(() => { frame21Ref.current = frame21Input; }, [frame21Input]);
  useEffect(() => { frame22Ref.current = frame22Input; }, [frame22Input]);
  useEffect(() => { frame23Ref.current = frame23Input; }, [frame23Input]);
  useEffect(() => { frame24Ref.current = frame24Input; }, [frame24Input]);
  useEffect(() => { frame25Ref.current = frame25Input; }, [frame25Input]);

  // Sync dynamicStMin from parent Flow Control monitoring frame parser
  useEffect(() => {
    setStMinInterval(dynamicStMin);
  }, [dynamicStMin]);

  // Master Seed-Key calculation
  const calculateDerivedKey = (seedHex: string): string => {
    try {
      if (!seedHex || seedHex.length !== 8) return "";
      let val = parseInt(seedHex, 16);
      
      // ROT3 Left Shift
      let shift = ((val << 3) | (val >>> 29)) & 0xFFFFFFFF;

      if (mathFormula === 'rot3_endian_swap') {
        // ROT3 + Endian reversal math strategy
        let flipped = ((shift & 0xFF) << 24) | (((shift >>> 8) & 0xFF) << 16) | (((shift >>> 16) & 0xFF) << 8) | ((shift >>> 24) & 0xFF);
        return (flipped >>> 0).toString(16).toUpperCase().padStart(8, '0');
      } else {
        // Standard Custom XOR + Offset (fully dynamic settings)
        const maskVal = parseInt(xorMask, 16) || 0;
        const offsetVal = parseInt(offsetValue, 16) || 0;
        let keyResult = ((shift ^ maskVal) + offsetVal) >>> 0;
        return keyResult.toString(16).toUpperCase().padStart(8, '0');
      }
    } catch (e) { return ""; }
  };

  const transmitRawLawicell = async (lawicellString: string) => {
    if (parentAddLog) {
      parentAddLog(`>> [TX LAN]: ${lawicellString}`, 'tx');
    }
    return parentTransmitRawLawicell(lawicellString);
  };

  // Class-scoped standard UDS NRC translations helper
  const translateNrcLocal = (nrcCode: string): string => {
    const code = nrcCode.toUpperCase();
    const mapping: Record<string, string> = {
      '10': 'General Reject (ЭБУ отклонил запрос без указания причин)',
      '11': 'Service Not Supported (Данная служба не поддерживается ЭБУ)',
      '12': 'Subfunction Not Supported (Данный подкласс функции не поддерживается на текущем сеансе)',
      '13': 'Incorrect Message Length or Invalid Format (Неверная длина пакета или некорректный формат)',
      '22': 'Conditions Not Correct (Нарушены внешние условия: двигатель должен быть заглушен, зажигание ВКЛ)',
      '24': 'Request Sequence Error (Нарушена последовательность команд UDS)',
      '31': 'Request Out Of Range (Запрашиваемые значения выходят за пределы допустимых)',
      '33': 'Security Access Denied (Доступ заблокирован. Требуется пройти авторизацию Seed-Key)',
      '35': 'Invalid Key (Неверный ключ! ЭБУ отклонил рассчитанный крипто-вектор)',
      '36': 'Exceeded Number of Attempts (Превышено число попыток ввода ключа)',
      '37': 'Required Time Delay Not Expired (Время задержки безопасности не истекло. Подождите)',
      '78': 'Request Received - Response Pending (Запрос принят к исполнению, ЭБУ занят операцией)',
    };
    return mapping[code] || `Ошибка ЭБУ (NRC 0x${code})`;
  };

  // --- 📡 HIGH-SPEED STERILE TRAFFIC LISTENERS ---
  const processIncomingSerialStreamPacket = (rawLine: string) => {
    let dataPayload = "";
    const rawUpper = rawLine.toUpperCase();
    const dMarker = rawUpper.lastIndexOf("D=");
    if (dMarker !== -1) {
      dataPayload = rawUpper.substring(dMarker + 2).replace(/[^0-9A-FA-F]/g, '');
    } else {
      const rxTargetHex = currentRxId.toString(16).toUpperCase();
      const rxIdIndex = rawUpper.indexOf(rxTargetHex);
      if (rxIdIndex !== -1) {
        dataPayload = rawUpper.substring(rxIdIndex + rxTargetHex.length).replace(/[^0-9A-FA-F]/g, '');
      } else {
        dataPayload = rawUpper.replace(/[^0-9A-FA-F]/g, '');
      }
    }

    if (dataPayload.length < 16) return;
    // Keep exactly 16 hex characters of the 8-byte CAN frame
    dataPayload = dataPayload.substring(0, 16);

    try {
      // Let's decode the payload structurally!
      // Byte 0 is PCI. Byte 1 is Service ID (SID) or Flow Control flags.

      // 1. Intercept service 67 response (Seed)
      // Usually, Seed is streamed as a multi-frame. First Frame starts with PCI = '1'. 
      // Payload format: [1x xx] [67] [sub] [seed_byte_0] ...
      // Can also be a single frame starting with PCI = '0' / Service = '67' / sub.
      const seedResponsePrefix = "67" + udsSecurityLevel;
      const isMultiFrameSeed = dataPayload.startsWith("1") && dataPayload.substring(4, 8) === seedResponsePrefix;
      const isSingleFrameSeed = dataPayload.startsWith("0") && dataPayload.substring(2, 6) === seedResponsePrefix;

      if (isMultiFrameSeed || isSingleFrameSeed) {
        if (isMultiFrameSeed) {
          // Send Flow Control CTS to ECU first to satisfy the ECU multi-frame broadcast buffer
          transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}83000000000000000`).catch(() => {});
        }

        // Extracted seed: index 8-16 for MultiFrame, 6-14 for SingleFrame
        const extractedSeed = isMultiFrameSeed ? dataPayload.substring(8, 16) : dataPayload.substring(6, 14);
        
        if (extractedSeed && extractedSeed.length === 8) {
          const derivedKey = calculateDerivedKey(extractedSeed);
          if (derivedKey && derivedKey.length === 8) {
            (window as any).calculatedVolvoKey = derivedKey;
            (window as any).isKeyReady = true; // synchronous ready trigger locks instant
            setCalculatedKeyResult(derivedKey);
            parentSetCalculatedKeyResult(derivedKey);
            if (parentAddLog) {
              parentAddLog(`[🔧 ПАРСЕР SUB-FLOW]: Обнаружен Seed ${extractedSeed} ➔ Ключ: ${derivedKey}`, 'success');
            }
          }
        }
      }

      // 2. Intercept key validation status response (67 [keyLevel])
      // Usually, positive response is a Single Frame [02] [67] [keyLevel] [00/AA/xx] ...
      const keyLevelHex = getUdsKeyLevel(udsSecurityLevel);
      const keyResponsePrefix = "67" + keyLevelHex;
      if (dataPayload.substring(2, 6) === keyResponsePrefix) {
        (window as any).isTab7KeyAccepted = true;
        if (parentAddLog) {
          parentAddLog(`[📡 ПОДТВЕРЖДЕНИЕ]: Ключ успешно верифицирован (Security Access Active!) ➔ 67 ${keyLevelHex}`, 'success');
        }
      }

      // 3. Check Flow Control frames (PCI starts with '3')
      if (dataPayload.startsWith("3")) {
        const fcType = dataPayload.substring(0, 2); // '30', '31', '32'
        if (fcType === "30" || fcType === "31" || fcType === "32") {
          if (fcType === "30") {
            setFlowControlState('READY_TO_SEND');
            (window as any).tab7FlowControlState = 'READY_TO_SEND';
            if (parentAddLog) {
              parentAddLog(`[📡 ISO-TP TRIGGER]: Пойман Flow Control [CONTINUE]! Логические ворота открыты.`, 'success');
            }
            
            // Read requested Separation Time (STmin) dynamically from byte 2 (characters 4-5) of FC payload
            // Format of Flow Control: [30] [BS] [STmin]
            const stminHex = dataPayload.substring(4, 6);
            let requestedStmin = parseInt(stminHex, 16) || 0;
            if (requestedStmin > 0x7F) {
              requestedStmin = 25; // fail-safe spacing constraint
            }
            if (parentAddLog) {
              parentAddLog(`[📡 ISO-TP Flow Control]: ЭБУ затребовал задержку отправки STmin = ${requestedStmin} мс.`, 'warn');
            }
            setStMinInterval(requestedStmin);
            setDynamicStMin(requestedStmin);
          } else if (fcType === "31") {
            setFlowControlState('WAITING_FOR_READY');
            (window as any).tab7FlowControlState = 'WAITING_FOR_READY';
            if (parentAddLog) {
              parentAddLog(`[📡 ISO-TP TRIGGER]: Пойман маркер [WAIT]. Поток заморожен.`, 'warn');
            }
          } else if (fcType === "32") {
            setFlowControlState('OVERFLOW');
            (window as any).tab7FlowControlState = 'OVERFLOW';
            if (parentAddLog) {
              parentAddLog(`[📡 ISO-TP TRIGGER]: Пойман маркер [OVERFLOW/ABORT] (32). Буфер полон или неподдерживаемая длина!`, 'err');
            }
          }
        }
      }

      // 4. Intercept service 6EF185 (positive response to WriteDataByIdentifier 2E F1 85)
      // Usually Single Frame: [0x] [6E] [F1] [85] ...
      if (dataPayload.substring(2, 8) === "6EF185") {
        (window as any).isTab7WriteConfirmed = true;
        if (parentAddLog) {
          parentAddLog(`[📡 ПОДТВЕРЖДЕНИЕ]: ЭБУ подтвердил запись (Service 2E F1 85) ➔ 6E F1 85`, 'success');
        }
      }

      // 5. Intercept service 63 (positive response to ReadMemoryByAddress 23)
      // Standard Single Frame format: [xx] [63] [value] [xx] [xx] [xx] [xx] [xx]
      // Byte 1 (indices 2-3) is SID '63'. Byte 2 (indices 4-5) is the read value.
      if (dataPayload.substring(2, 4) === "63") {
        const extractedValue = dataPayload.substring(4, 6);
        (window as any).lastTab7ReadValue = extractedValue;
        (window as any).isTab7ReadReady = true;
        if (parentAddLog) {
          parentAddLog(`[📡 ВЕРИФИКАЦИЯ]: ЭБУ подтвердил чтение (Service 23) ➔ Получено: ${extractedValue} (${parseInt(extractedValue, 16)} dec)`, 'success');
        }
      }

      // 6. Intercept UDS Negative Responses (NRC)
      // Format of negative response SID: [xx] [7F] [Service_ID] [NRC_Code]
      // Byte 1 (indices 2-3) is always '7F'
      if (dataPayload.substring(2, 4) === "7F") {
        const serviceId = dataPayload.substring(4, 6);
        const nrcCode = dataPayload.substring(6, 8);
        
        if (serviceId === "27") {
          if (nrcCode === "78") {
            (window as any).isTab7KeyPending = true;
            if (parentAddLog) {
              parentAddLog(`[📡 ISO-TP]: ЭБУ затребовал время для обработки ключа (Response Pending 7F 27 78)...`, 'warn');
            }
          } else {
            (window as any).isTab7KeyError = nrcCode;
            if (parentAddLog) {
              parentAddLog(`[📡 NRC ОШИБКА 27 - KEY]: ЭБУ отклонил ключ. Код: ${nrcCode} (${translateNrcLocal(nrcCode)})`, 'err');
            }
          }
        } else if (serviceId === "2E") {
          if (nrcCode === "78") {
            (window as any).isTab7WritePending = true;
            if (parentAddLog) {
              parentAddLog(`[📡 ISO-TP]: ЭБУ затребовал время для записи (Response Pending 7F 2E 78)...`, 'warn');
            }
          } else {
            (window as any).isTab7WriteError = nrcCode;
            if (parentAddLog) {
              parentAddLog(`[📡 NRC ОШИБКА 2E - WRITE]: ЭБУ отклонил запись. Код: ${nrcCode} (${translateNrcLocal(nrcCode)})`, 'err');
            }
          }
        } else if (serviceId === "23") {
          if (nrcCode === "78") {
            (window as any).isTab7ReadPending = true;
            if (parentAddLog) {
              parentAddLog(`[📡 ISO-TP]: ЭБУ затребовал время для чтения (Response Pending 7F 23 78)...`, 'warn');
            }
          } else {
            (window as any).isTab7ReadError = nrcCode;
            if (parentAddLog) {
              parentAddLog(`[📡 NRC ОШИБКА 23 - READ]: ЭБУ отклонил чтение. Код: ${nrcCode} (${translateNrcLocal(nrcCode)})`, 'err');
            }
          }
        }
      }

    } catch (err) {}
  };

  // Bind background sniffer hooks
  useEffect(() => {
    const handleBgCanReceive = (payload: string) => {
      // Decode Dynamic Flow Control payload starting with 30
      if (payload.toUpperCase().replace(/\s+/g, '').startsWith("30")) {
        const cleanPayload = payload.toUpperCase().replace(/\s+/g, '');
        const stminHex = cleanPayload.substring(4, 6);
        let requestedStmin = parseInt(stminHex, 16) || 0;
        if (requestedStmin <= 127) {
          setStMinInterval(requestedStmin);
          setDynamicStMin(requestedStmin);
        }
      }
      processIncomingSerialStreamPacket(`<< ID=${currentRxId.toString(16).toUpperCase()} D=${payload}`);
    };
    (window as any).__ACTIVE_CAN_RECEIVE_HANDLER__ = handleBgCanReceive;
    return () => {
      if ((window as any).__ACTIVE_CAN_RECEIVE_HANDLER__ === handleBgCanReceive) {
        (window as any).__ACTIVE_CAN_RECEIVE_HANDLER__ = null;
      }
    };
  }, [currentRxId, mathFormula, xorMask, offsetValue]);

  const executeManualStep1HANDSHAKE = async () => {
    if (parentAddLog) {
      parentAddLog(`[🚀 ШАГ 1]: Инициализация сессии 10 ${udsSessionType} и запрос Seed (уровень 27 ${udsSecurityLevel})...`, 'info');
    }
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}80210${udsSessionType}AAAAAAAAAA`);
    await new Promise(r => setTimeout(r, 120));
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}80227${udsSecurityLevel}AAAAAAAAAA`);
  };

  const handleMonolithicAutomatedTriggerBurn = async () => {
    (window as any).calculatedVolvoKey = "";
    (window as any).isKeyReady = false; 
    setCalculatedKeyResult('');
    parentSetCalculatedKeyResult('');
    setFlowControlState('IDLE');
    (window as any).tab7FlowControlState = 'IDLE';
    (window as any).isTab7KeyAccepted = false;
    (window as any).isTab7KeyPending = false;
    (window as any).isTab7KeyError = null;
    (window as any).isTab7WriteConfirmed = false;
    (window as any).isTab7WritePending = false;
    (window as any).isTab7WriteError = null;
    (window as any).isTab7ReadReady = false;
    (window as any).isTab7ReadPending = false;
    (window as any).isTab7ReadError = null;
    
    if (parentAddLog) {
      parentAddLog(`[🔥 АВТОМАТ]: Отправка стартового запроса. Сессия 10 ${udsSessionType}...`, 'warn');
    }
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}80210${udsSessionType}AAAAAAAAAA`);
    await new Promise(r => setTimeout(r, 120));

    if (parentAddLog) {
      parentAddLog(`[🔥 АВТОМАТ]: Запрос калибровочного Seed 27 ${udsSecurityLevel}...`, 'warn');
    }
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}80227${udsSecurityLevel}AAAAAAAAAA`);
    
    // Check key lock loop
    let pollingLimit = 0;
    let synchronizedKey = "";
    while (pollingLimit < 120) { // 3000ms max timeout (120 * 25ms)
      await new Promise(r => setTimeout(r, 25)); 
      if ((window as any).isKeyReady === true) {
         synchronizedKey = (window as any).calculatedVolvoKey || "";
         break;
      }
      pollingLimit++;
    }

    if (!synchronizedKey || synchronizedKey.length !== 8) {
      if (parentAddLog) {
        parentAddLog('[❌ ОШИБКА]: Таймаут ожидания Seed от ЭБУ или неверные параметры расчета.', 'err');
      }
      return;
    }

    // Let the ECU finish sending all remaining consecutive frames of the Seed response
    if (parentAddLog) {
      parentAddLog('[📡 ПАРУЗА ОЖИДАНИЯ]: Ключ получен. Даем ЭБУ 150мс для завершения выдачи Seed и разгрузки шины...', 'info');
    }
    await new Promise(r => setTimeout(r, 150));

    // Reset flow control state before sending Key First Frame
    setFlowControlState('IDLE');
    (window as any).isTab7KeyPending = false;

    // Deliver Key as a perfect compliant ISO-TP Multi-Frame (ECU requirement)
    if (parentAddLog) {
      parentAddLog(`[🚀 ИНЖЕКТОР]: Отправка рассчитанного ключа ${synchronizedKey} (ISO-TP Multi-Frame First Frame)...`, 'warn');
    }
    // First Frame: PCI=10, Length=06, Service=27, Sublevel = (seedLevel + 1) + first 2 bytes of key
    const keySublevel = getUdsKeyLevel(udsSecurityLevel);
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}8100627${keySublevel}${synchronizedKey.substring(0, 4)}AAAA`);
    
    // For key delivery of total length 6 bytes, do NOT wait for Flow Control (ECU does not issue FC for this short multi-frame).
    // We instantly transition with a short compliant separation time delay (STmin interval, e.g. 25-30ms) to let ECU process the First Frame.
    if (parentAddLog) {
      parentAddLog(`[📡 ISO-TP KEY]: Первый кадр отослан. Пауза ${Math.max(25, stMinInterval)}мс до отправки Consecutive Frame...`, 'info');
    }
    await new Promise(r => setTimeout(r, Math.max(25, stMinInterval)));
    
    // Consecutive Frame: PCI=21 + last 2 bytes of key + padding bytes (AA)
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}821${synchronizedKey.substring(4, 8)}AAAAAAAAAA`);

    // Wait and verify if Security Access is actually unlocked (67 [keySublevel])
    let keyPollingLimit = 0;
    let isKeyAccepted = false;
    while (keyPollingLimit < 150) { // 3000ms max timeout (150 * 20ms)
      await new Promise(r => setTimeout(r, 20));
      if ((window as any).isTab7KeyAccepted === true) {
        isKeyAccepted = true;
        break;
      }
      if ((window as any).isTab7KeyPending === true) {
        (window as any).isTab7KeyPending = false;
        keyPollingLimit = Math.max(0, keyPollingLimit - 25); // extend timeout dynamically by 500ms
        if (parentAddLog) {
          parentAddLog('[📡 ISO-TP]: ЭБУ рассчитывает подпись ключа (Response Pending 7F 27 78). Удлиняем таймаут...', 'info');
        }
      }
      if ((window as any).isTab7KeyError) {
        break;
      }
      keyPollingLimit++;
    }

    if (!isKeyAccepted) {
      if ((window as any).isTab7KeyError) {
        if (parentAddLog) {
          parentAddLog(`[❌ ОШИБКА СДАЧИ КЛЮЧА]: ЭБУ отклонил ключ с NRC ${(window as any).isTab7KeyError}. Тест прерван.`, 'err');
        }
        return;
      } else {
        if (parentAddLog) {
          parentAddLog('[⚠️ ВНИМАНИЕ]: Ответ безопасности 67 2A не получен вовремя. Продолжение процедуры на страх и риск...', 'warn');
        }
      }
    } else {
      if (parentAddLog) {
        parentAddLog('[🎉 СЕКЬЮРИТИ РАЗБЛОКИРОВАНА]: ЭБУ подтвердил успешную авторизацию (67 2A).', 'success');
      }
      await new Promise(r => setTimeout(r, 50));
    }

    // Determine target size and configurations based on selected preset
    let targetLength = 38;
    let lengthHex = '26';
    let framesSelected: string[] = [];

    if (writePreset === '17_launch') {
      targetLength = 17;
      lengthHex = '11';
      framesSelected = [
        frame21Ref.current,
        frame22Ref.current
      ];
    } else {
      targetLength = 38;
      lengthHex = '26';
      framesSelected = [
        frame21Ref.current,
        frame22Ref.current,
        frame23Ref.current,
        frame24Ref.current,
        frame25Ref.current
      ];
    }

    if (parentAddLog) {
      parentAddLog(`[🚀 ИНЖЕКТОР]: Отправка First Frame Service 2E. Запись ${targetLength} байт...`, 'warn');
    }
    
    (window as any).isTab7WriteConfirmed = false;
    (window as any).isTab7WriteError = null;
    setFlowControlState('IDLE');

    // First Frame message format
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}810${lengthHex}2EF185011029`);

    // Interactive Flow Control check loop
    let fcLimit = 0;
    let fcReceived = false;
    (window as any).tab7FlowControlState = 'IDLE';
    while (fcLimit < 50) { // 1000ms max timeout (50 * 20ms)
      await new Promise(r => setTimeout(r, 20));
      
      if ((window as any).tab7FlowControlState === 'READY_TO_SEND') {
        fcReceived = true;
        break;
      }
      
      if ((window as any).tab7FlowControlState === 'WAITING_FOR_READY') {
        // Reset limit slightly to allow ECU processing time on busy operations
        fcLimit = Math.max(0, fcLimit - 3); 
        if (parentAddLog) {
          parentAddLog('[📡 ISO-TP]: ЭБУ затребовал [WAIT]. Продление интервала ожидания...', 'info');
        }
        (window as any).tab7FlowControlState = 'IDLE'; 
      }
      
      if ((window as any).tab7FlowControlState === 'OVERFLOW') {
        if (parentAddLog) {
          parentAddLog('[❌ ОШИБКА ПЕРЕПОЛНЕНИЯ]: ЭБУ отклонил длину калибровки (Overflow / Buffer full)! Прожиг прерван.', 'err');
        }
        return;
      }
      
      if ((window as any).isTab7WriteError) {
        if (parentAddLog) {
          parentAddLog(`[❌ ОШИБКА ЗАПИСИ]: Процедура сброшена по UDS NRC ${(window as any).isTab7WriteError}.`, 'err');
        }
        return;
      }

      fcLimit++;
    }

    if (!fcReceived) {
      if (parentAddLog) {
        parentAddLog('[⚠️ ВНИМАНИЕ]: Flow Control CTS не получен вовремя. Риск перегрузки буфера!', 'warn');
      }
    } else {
      if (parentAddLog) {
        parentAddLog('[📡 ISO-TP CTS]: Пойман Flow Control [CONTINUE]. Запуск последовательной передачи...', 'success');
      }
    }

    // Sequentially transmit frames
    for (let i = 0; i < framesSelected.length; i++) {
      const pciIndex = 0x21 + i;
      const dataFrame = framesSelected[i];
      const paddedDataFrame = dataFrame.padEnd(14, 'A'); 
      await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}8${pciIndex.toString(16).toUpperCase()}${paddedDataFrame}`);
      if (i < framesSelected.length - 1) {
        await new Promise(r => setTimeout(r, stMinRef.current));
      }
    }
    
    // Poll for Service 2E positive response confirmation
    if (parentAddLog) {
      parentAddLog('[⏱️ ИНЖЕКТОР]: Ожидание окончательного подтверждения записи (6E F1 85) от ЭБУ...', 'info');
    }
    let writeVerifyTimeout = 0;
    let isConfirmed = false;
    (window as any).isTab7WritePending = false;
    while (writeVerifyTimeout < 150) { // 3000ms max timeout (150 * 20ms)
      await new Promise(r => setTimeout(r, 20));
      if ((window as any).isTab7WriteConfirmed === true) {
        isConfirmed = true;
        break;
      }
      if ((window as any).isTab7WritePending === true) {
        (window as any).isTab7WritePending = false;
        writeVerifyTimeout = Math.max(0, writeVerifyTimeout - 25); // extend timeout dynamically by 500ms
        if (parentAddLog) {
          parentAddLog('[📡 ISO-TP]: ЭБУ фиксирует запись в ПЗУ (Response Pending 7F 2E 78). Удлиняем таймаут...', 'info');
        }
      }
      if ((window as any).isTab7WriteError) {
        break;
      }
      writeVerifyTimeout++;
    }

    if (isConfirmed) {
      if (parentAddLog) {
        parentAddLog('[🎉 ЗАПИСЬ ПОДТВЕРЖДЕНА]: Ответ 6E F1 85 получен! Сектор изменен.', 'success');
      }
      await new Promise(r => setTimeout(r, 100));
    } else {
      if ((window as any).isTab7WriteError) {
        if (parentAddLog) {
          parentAddLog(`[❌ ОШИБКА ЗАПИСИ]: Процедура прервана по ошибке NRC ${(window as any).isTab7WriteError}.`, 'err');
        }
        return;
      } else {
        if (parentAddLog) {
          parentAddLog('[⚠️ ВНИМАНИЕ]: Ответ верификации Service 2E не был захвачен вовремя. Попытка чтения...', 'warn');
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }

    // Write verification readback of parameters Service 23 (ReadMemoryByAddress)
    if (parentAddLog) {
      parentAddLog('[🚀 ИНЖЕКТОР]: Считывание записанного значения для верификации и прожига (Service 23)...', 'warn');
    }
    (window as any).lastTab7ReadValue = "";
    (window as any).isTab7ReadReady = false;
    (window as any).isTab7ReadError = null;
    setFlowControlState('IDLE');

    // Command frame 1: ReadMemoryByAddress format 25, address 01 00 01 85
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}81009232501000185`);

    // Wait for Flow Control CTS before issuing CF frame
    let rdFcLimit = 0;
    let rdFcReceived = false;
    (window as any).tab7FlowControlState = 'IDLE';
    while (rdFcLimit < 40) {
      await new Promise(r => setTimeout(r, 20));
      if ((window as any).tab7FlowControlState === 'READY_TO_SEND') {
        rdFcReceived = true;
        break;
      }
      if ((window as any).tab7FlowControlState === 'WAITING_FOR_READY') {
        rdFcLimit = Math.max(0, rdFcLimit - 2);
        (window as any).tab7FlowControlState = 'IDLE';
      }
      if ((window as any).isTab7ReadError) {
        break;
      }
      rdFcLimit++;
    }

    if (!rdFcReceived && !(window as any).isTab7ReadError) {
      if (parentAddLog) {
        parentAddLog('[⚠️ ВНИМАНИЕ]: Flow Control CTS для Чтения не был получен. Принудительная отправка...', 'warn');
      }
    }

    // Command frame 2: Mask BD, size 00 01
    await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}821BD000100000000`);

    // Poll for verification read result
    let verifyTimeout = 0;
    let readbackValue = "";
    (window as any).isTab7ReadPending = false;
    while (verifyTimeout < 30) {
      await new Promise(r => setTimeout(r, 20));
      if ((window as any).isTab7ReadReady === true) {
        readbackValue = (window as any).lastTab7ReadValue || "";
        break;
      }
      if ((window as any).isTab7ReadPending === true) {
        (window as any).isTab7ReadPending = false;
        verifyTimeout = Math.max(0, verifyTimeout - 10); // extend timeout dynamically by 200ms
        if (parentAddLog) {
          parentAddLog('[📡 ISO-TP]: ЭБУ готовит чтение памяти (Response Pending 7F 23 78). Удлиняем таймаут...', 'info');
        }
      }
      if ((window as any).isTab7ReadError) {
        break;
      }
      verifyTimeout++;
    }

    let pureValue = payloadValueRef.current.toUpperCase().replace(/[^0-9A-Fa-f]/g, '').substring(0, 2) || "3C";
    if (readbackValue) {
      const matchStatus = readbackValue.toUpperCase() === pureValue.toUpperCase() ? "СОВПАДАЕТ ✅" : "РАСХОДИТСЯ ⚠️";
      if (parentAddLog) {
        parentAddLog(`[🎉 ПРОЖИГ ПОДТВЕРЖДЕН]: Ожидалось HEX: ${pureValue}, Прочитано: ${readbackValue} (${matchStatus})!`, 'success');
      }
    } else {
      if ((window as any).isTab7ReadError) {
        if (parentAddLog) {
          parentAddLog(`[⚠️ ВНИМАНИЕ]: Чтение верификации вернуло ошибку NRC ${(window as any).isTab7ReadError} (${translateNrcLocal((window as any).isTab7ReadError)}). Возможно, датчики заблокированы.`, 'warn');
        }
      } else {
        if (parentAddLog) {
          parentAddLog('[⚠️ ВНИМАНИЕ]: Ответ верификации Service 23 не был получен вовремя. Пропускаем.', 'warn');
        }
      }
    }

    if (parentAddLog) {
      parentAddLog('[⏱️ ИНЖЕКТОР]: Ожидание окончательной фиксации секторов ПЗУ (800мс)...', 'info');
    }
    await new Promise(r => setTimeout(r, 800));

    // Handle end-of-flow action (Default Session or Hard System Reset)
    if (parentAddLog) {
      parentAddLog('[🎉 ПАТЧИНГ УСПЕШНО ЗАВЕРШЕН]: Поток уложен без потерь! Завершение UDS-сессии...', 'success');
    }

    if (terminationAction === '1001') {
      if (parentAddLog) {
        parentAddLog('⚙️ [ЗАВЕРШЕНИЕ]: Возврат в стандартную сессию ЭБУ (DiagnosticSessionControl 10 01)...', 'info');
      }
      await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}8021001AAAAAAAAAA`);
    } else {
      if (parentAddLog) {
        parentAddLog('⚙️ [ЗАВЕРШЕНИЕ]: Физический сброс ЭБУ через службу UDS 11 02 RESET...', 'warn');
      }
      await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}8021102AAAAAAAAAA`);
    }
  };

  // Boundary checker logic for human entry parameters safety
  const getSelectedLimits = () => {
    if (selectedDidType === 'F185') return { label: 'Vehicle Speed Limit (km/h)', min: 60, max: 130 };
    if (selectedDidType === '1ABE') return { label: 'Engine Speed Limit (RPM)', min: 1200, max: 2500 };
    if (selectedDidType === 'C102') return { label: 'Idle RPM Offset (RPM)', min: 500, max: 1100 };
    if (selectedDidType === 'D140') return { label: 'AdBlue Flow Rate (%)', min: 50, max: 150 };
    return { label: 'Custom Address Register', min: 0, max: 255 };
  };

  const limits = getSelectedLimits();
  const currentDecVal = parseInt(paramNewValue, 16) || 0;
  const isOutOfBounds = currentDecVal < limits.min || currentDecVal > limits.max;
  const isBlockedByLimits = isOutOfBounds && !expertMode;

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden layout binding results */}
      <div id="hidden_key_store" className="hidden">{calculatedKeyResult}</div>

      {/* Main Panel Content Card */}
      <div className="bg-white border border-[#EAE6DD] rounded-2xl p-4 flex flex-col gap-4 shadow-sm">
        
        {/* Title Block */}
        <div className="flex items-center justify-between border-b border-[#F0ECE3] pb-3">
          <span className="text-[10px] uppercase font-bold text-[#4D625A] tracking-wider font-mono flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#88A699]" />
            Калибратор калибровочных параметров CAN-UDS
          </span>
          <span className="text-[9px] font-mono font-bold bg-[#E6ECE9] text-[#4A7261] px-2 py-0.5 rounded-full">
            Tab 7 Mode
          </span>
        </div>

        {/* 📋 ПРЕДУСТАНОВОЧНЫЕ ПРОФИЛИ НАСТРОЕК ЭБУ (ECU PRESET PROFILES) */}
        <div className="bg-[#FAF9F5] rounded-xl p-3 border border-[#EBE7DE] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider font-mono flex items-center gap-1.5 select-none">
              <Cpu className="w-3.5 h-3.5 text-stone-400" />
              Готовые профили предустановок ЭБУ
            </span>
            <span className="text-[8px] bg-amber-100 text-amber-800 font-mono font-bold px-1.5 py-0.5 rounded animate-pulse">
              РЕКОМЕНДОВАННЫЕ ПАРАМЕТРЫ
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(ECU_PRESET_PROFILES).map(([key, profile]) => {
              const isActive = selectedPresetProfile === key;
              return (
                <div 
                  key={key}
                  className={`relative p-2.5 rounded-xl border transition-all flex flex-col gap-1 cursor-pointer select-none group ${
                    isActive 
                      ? 'bg-amber-50/20 border-amber-500/60 shadow-xs' 
                      : 'bg-white hover:bg-stone-50/50 border-stone-200'
                  }`}
                  onClick={() => handleSelectEcuPreset(key)}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-[11px] text-stone-700 tracking-tight flex items-center gap-1">
                      {isActive && <CheckCircle2 className="w-3 h-3 text-amber-600 shrink-0" />}
                      {profile.name}
                    </span>
                    
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTooltip(activeTooltip === key ? null : key);
                      }}
                      className="text-stone-400 hover:text-stone-600 transition-colors cursor-help p-0.5"
                      title="Подробные параметры"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">
                    {profile.codename}
                  </span>
                  
                  <p className="text-[9px] text-stone-400 leading-snug">
                    {profile.description}
                  </p>

                  {/* Всплывающее информационное окно (Floating Tooltip popup panel) */}
                  {activeTooltip === key && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#FFFCE8] border-2 border-[#E9DFBD] text-[#7A6122] rounded-xl p-3 shadow-lg z-40 text-[10.5px] leading-relaxed font-sans text-left animate-fadeIn">
                      <div className="flex items-center justify-between border-b border-[#F4EFCF] pb-1 mb-1.5">
                        <strong className="font-bold uppercase text-[9px] font-mono flex items-center gap-1">
                          <Info className="w-3 h-3 text-amber-600" />
                          Параметры {profile.name}
                        </strong>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(null);
                          }}
                          className="font-bold text-stone-500 hover:text-stone-700 text-xs font-mono px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-[10px] leading-relaxed">
                        {profile.detailedInfo}
                      </pre>
                      <p className="mt-2 text-[9px] italic border-t border-[#F4EFCF] pt-1 text-[#867035]">
                        *Все параметры заполнятся автоматически с возможностью изменения вручную.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 📋 ПРЕДУСТАНОВОЧНЫЕ СЕССИИ И ДОСТУП UDS (UDS SESSION & ACCESS PRESETS) */}
        <div className="bg-[#FAF9F5] rounded-xl p-3 border border-[#EBE7DE] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider font-mono flex items-center gap-1.5 select-none">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
              Предустановки сессий и уровней доступа UDS
            </span>
            <span className="text-[8px] bg-[#E3EFE9] text-[#2F5846] font-mono font-bold px-1.5 py-0.5 rounded">
              ГИБКАЯ НАСТРОЙКА
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {Object.entries(UDS_ACCESS_PRESETS).map(([key, item]) => {
              const isActive = selectedUdsPreset === key;
              return (
                <div 
                  key={key}
                  className={`relative p-2 rounded-lg border transition-all flex flex-col gap-0.5 cursor-pointer select-none group ${
                    isActive 
                      ? 'bg-amber-50/20 border-amber-500/60 shadow-xs' 
                      : 'bg-white hover:bg-stone-50/50 border-stone-200'
                  }`}
                  onClick={() => {
                    setSelectedUdsPreset(key);
                    setUdsSessionType(item.session);
                    setUdsSecurityLevel(item.secLevel);
                    if (parentAddLog) {
                      parentAddLog(`[🔧 UDS ПРЕСЕТ]: Выбран режим "${item.name}". Сессия: 10 ${item.session}, Request Seed: 27 ${item.secLevel}.`, 'info');
                    }
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-[9.5px] text-stone-700 tracking-tight leading-tight">
                      {item.name.split(' (')[0]}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveUdsTooltip(activeUdsTooltip === key ? null : key);
                      }}
                      className="text-stone-400 hover:text-stone-600 transition-colors p-0.5 cursor-help"
                      title="Подробнее о режиме"
                    >
                      <HelpCircle className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[8.5px] font-mono font-bold text-slate-500">
                    10 {item.session} &rarr; 27 {item.secLevel}
                  </span>
                  
                  {activeUdsTooltip === key && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#FFFCE8] border-2 border-[#E9DFBD] text-[#7A6122] rounded-xl p-3 shadow-lg z-50 text-[10.5px] leading-relaxed font-sans text-left">
                      <div className="flex items-center justify-between border-b border-[#F4EFCF] pb-1 mb-1.5">
                        <strong className="font-bold uppercase text-[9px] font-mono flex items-center gap-1">
                          <Info className="w-3 h-3 text-amber-600" />
                          Справка: {item.name}
                        </strong>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveUdsTooltip(null);
                          }}
                          className="font-bold text-stone-500 hover:text-stone-700 text-xs font-mono px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="whitespace-pre-line font-sans text-[10px] leading-normal text-stone-700">
                        {item.detailedInfo}
                      </p>
                      <p className="mt-2 text-[8.5px] italic border-t border-[#F4EFCF] pt-1 text-stone-400">
                        *Вы можете донастроить значения в полях ввода ниже вручную.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ручные поля ввода сессии и сессионного ключа */}
          <div className="grid grid-cols-2 gap-3 mt-1 bg-white p-2.5 rounded-lg border border-stone-200">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-bold text-stone-500 uppercase tracking-wide">Подфункция сессии UDS:</span>
                <span className="text-[8px] font-mono text-stone-400 bg-stone-100 px-1 rounded">SID: 10</span>
              </div>
              <div className="flex gap-1.5">
                <input 
                  type="text"
                  value={udsSessionType}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').substring(0, 2);
                    setUdsSessionType(val);
                    setSelectedUdsPreset('custom');
                  }}
                  className="w-full bg-[#FAF9F5] border border-stone-200 rounded-lg py-1 px-2.5 text-xs font-mono tracking-wider font-bold text-stone-700 uppercase focus:outline-none focus:border-[#98B5A6] text-center"
                  maxLength={2}
                  placeholder="03"
                />
                <select 
                  value={udsSessionType}
                  onChange={(e) => {
                    setUdsSessionType(e.target.value);
                    setSelectedUdsPreset('custom');
                  }}
                  className="bg-[#FAF9F5] border border-stone-200 rounded-lg py-1 px-1.5 text-[10px] font-sans text-stone-600 focus:outline-none focus:border-[#98B5A6]"
                >
                  <option value="03">03 Extended</option>
                  <option value="01">01 Default</option>
                  <option value="02">02 Programming</option>
                  <option value="04">04 Safety</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-bold text-stone-500 uppercase tracking-wide">Уровень доступа Security:</span>
                <span className="text-[8px] font-mono text-stone-400 bg-stone-100 px-1 rounded">SID: 27 / Key: {getUdsKeyLevel(udsSecurityLevel)}</span>
              </div>
              <div className="flex gap-1.5">
                <input 
                  type="text"
                  value={udsSecurityLevel}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').substring(0, 2);
                    setUdsSecurityLevel(val);
                    setSelectedUdsPreset('custom');
                  }}
                  className="w-full bg-[#FAF9F5] border border-stone-200 rounded-lg py-1 px-2.5 text-xs font-mono tracking-wider font-bold text-stone-700 uppercase focus:outline-none focus:border-[#98B5A6] text-center"
                  maxLength={2}
                  placeholder="29"
                />
                <select 
                  value={['29','01','03','11'].includes(udsSecurityLevel) ? udsSecurityLevel : 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') {
                      setUdsSecurityLevel(e.target.value);
                      setSelectedUdsPreset('custom');
                    }
                  }}
                  className="bg-[#FAF9F5] border border-stone-200 rounded-lg py-1 px-1.5 text-[10px] font-sans text-stone-600 focus:outline-none focus:border-[#98B5A6]"
                >
                  <option value="29">29 (Flash)</option>
                  <option value="01">01 (Diag)</option>
                  <option value="03">03 (Dealer)</option>
                  <option value="11">11 (Diag)</option>
                  <option value="custom">Ручной</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 1. SEED-KEY DYNAMIC Settings customization panel */}
        <div className="bg-[#FAF9F5] rounded-xl p-3 border border-[#EBE7DE] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider font-mono flex items-center gap-1">
              <Settings className="w-3.5 h-3.5 text-stone-400" />
              Параметры безопасности Seed-Key
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMathFormula('rot3_xor_offset')}
                className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono transition-all ${
                  mathFormula === 'rot3_xor_offset' ? 'bg-[#98B5A6] text-white shadow-xs' : 'bg-stone-100 text-stone-400'
                }`}
              >
                XOR/Offset
              </button>
              <button
                type="button"
                onClick={() => setMathFormula('rot3_endian_swap')}
                className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono transition-all ${
                  mathFormula === 'rot3_endian_swap' ? 'bg-[#98B5A6] text-white shadow-xs' : 'bg-stone-100 text-stone-400'
                }`}
              >
                Endian Swap
              </button>
            </div>
          </div>

          {mathFormula === 'rot3_xor_offset' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Маска XOR (Hex):</label>
                <input 
                  type="text" 
                  value={xorMask} 
                  onChange={(e) => setXorMask(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                  className="bg-white border border-[#EBE7DF] rounded-lg px-2.5 py-1 text-xs font-mono tracking-wider text-stone-700 text-center uppercase"
                  maxLength={8}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Смещение Offset (Hex):</label>
                <input 
                  type="text" 
                  value={offsetValue} 
                  onChange={(e) => setOffsetValue(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                  className="bg-white border border-[#EBE7DF] rounded-lg px-2.5 py-1 text-xs font-mono tracking-wider text-stone-700 text-center uppercase"
                  maxLength={8}
                />
              </div>
            </div>
          )}

          {mathFormula === 'rot3_endian_swap' && (
            <p className="text-[10px] text-stone-400 italic font-mono leading-relaxed bg-white p-2 border border-[#F0ECE3] rounded-lg">
              Используется фиксированный байтовый реверс криптоалгоритма ROT3. Настройки маски XOR и смещения в данном режиме неактивны.
            </p>
          )}
        </div>

        {/* 2. REGULATION BOUNDS AND EXPERT MODE */}
        <div className="bg-[#FAF9F5] rounded-xl p-3 border border-[#EBE7DE] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider font-mono flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-stone-400" />
              Контроль калибровочных диапазонов ЭБУ
            </span>
            <div className="flex items-center gap-1.5">
              <input 
                type="checkbox"
                id="expert_mode_check"
                checked={expertMode}
                onChange={(e) => setExpertMode(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-stone-300 text-[#98B5A6] focus:ring-[#98B5A6]"
              />
              <label htmlFor="expert_mode_check" className="text-[10px] font-bold text-stone-600 select-none cursor-pointer">
                Режим эксперта
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Калибруемый DID:</label>
              <select
                value={selectedDidType}
                onChange={(e) => setSelectedDidType(e.target.value)}
                className="bg-white border border-[#EBE7DF] rounded-lg px-2 py-1 text-xs font-sans text-stone-700 cursor-pointer focus:outline-none"
              >
                <option value="F185">Vehicle Speed Limit (F185)</option>
                <option value="1ABE">Engine Speed Limit (1ABE)</option>
                <option value="C102">Idle RPM Offset (C102)</option>
                <option value="D140">AdBlue Flow Rate (D140)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Значение HEX (uint8):</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={paramNewValue} 
                  maxLength={2}
                  onChange={(e) => {
                    const cleaned = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                    setParamNewValue(cleaned);
                    parentSetParamNewValue(cleaned);
                  }}
                  className={`w-full bg-white border rounded-lg px-2.5 py-1 text-xs font-mono font-bold tracking-wider text-center text-stone-700 uppercase ${
                    isBlockedByLimits ? 'border-red-300 text-red-600 bg-red-50/20' : 'border-[#EBE7DF]'
                  }`}
                />
                <span className="absolute right-2 top-1.5 text-[9px] text-stone-400 font-bold font-mono">
                  {currentDecVal} dec
                </span>
              </div>
            </div>
          </div>

          {/* Validation Banner or Expert Warning Warning labels cascade */}
          {isOutOfBounds ? (
            expertMode ? (
              <div className="bg-[#FFF1EC] text-[#933D25] p-2.5 rounded-lg text-[10px] leading-relaxed flex items-start gap-1.5 border border-[#F4CCC2]">
                <AlertTriangle className="w-3.5 h-3.5 text-[#C45E3B] shrink-0 mt-0.5" />
                <p>
                  <strong>Режим эксперта активен.</strong> Значение ({currentDecVal}) лежит вне физических границ. Сигнал будет передан «как есть». Будьте готовы к возможному отказу ЭБУ по коду <strong>NRC 31</strong> (Запрос выходит за пределы зоны действия).
                </p>
              </div>
            ) : (
              <div className="bg-red-50 text-red-700 p-2.5 rounded-lg text-[10px] leading-relaxed flex items-start gap-1.5 border border-red-200">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5 animate-bounce" />
                <p>
                  <strong>Лимиты заблокированы!</strong> Значение ({currentDecVal}) выходит за разрешенные рамки ({limits.min} - {limits.max} {selectedDidType === 'D140' ? '%' : selectedDidType === 'F185' ? 'km/h' : 'RPM'}). Активируйте «Режим эксперта» сверху, чтобы принудительно разблокировать ввод.
                </p>
              </div>
            )
          ) : (
            <div className="bg-[#F0F7F4] text-[#4A7261] p-2.5 rounded-lg text-[10.5px] leading-relaxed flex items-center gap-1.5 border border-[#DCEDE6]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#639883] shrink-0" />
              <span>Параметр в безопасных границах диапазона: {limits.min} - {limits.max} ({currentDecVal} {limits.label.split('(')[1]})</span>
            </div>
          )}
        </div>

        {/* 3. HARDWARE CONFIG PARAMS */}
        <div className="bg-[#FAF9F5] rounded-xl p-3 border border-[#EBE7DE] flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider flex items-center justify-between" title="Физический адрес EEPROM/Flash или ID параметра">
                <span>Адрес кал-ки:</span>
              </label>
              <input 
                type="text" 
                value={targetAddressHex} 
                onChange={(e) => setTargetAddressHex(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                className="bg-white border border-[#EBE7DF] rounded-lg px-2 py-1.5 text-xs font-mono tracking-wider text-[#4D625A] text-center uppercase"
                maxLength={8}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">STmin (мс):</label>
              <input 
                type="number" 
                value={stMinInterval} 
                onChange={(e) => {
                  const ms = Number(e.target.value) || 0;
                  setStMinInterval(ms);
                  setDynamicStMin(ms);
                }}
                className="bg-white border border-[#EBE7DF] rounded-lg px-2 py-1.5 text-xs font-mono text-stone-700 text-center"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Завершение UDS:</label>
              <select
                value={terminationAction}
                onChange={(e) => setTerminationAction(e.target.value as '1001' | '1102')}
                className="bg-white border border-[#EBE7DF] rounded-lg px-2 py-1.5 text-xs font-sans text-stone-700 cursor-pointer focus:outline-none"
              >
                <option value="1001">Сессия 10 01</option>
                <option value="1102">Сброс 11 02</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-[#F1ECE1]">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">TX CAN ID (Hex):</label>
              <input 
                type="text" 
                value={currentTxId.toString(16).toUpperCase()} 
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 16) || 0;
                  setCurrentTxId(parsed);
                }}
                className="bg-white border border-[#EBE7DF] rounded-lg px-2 py-1.5 text-xs font-mono tracking-widest text-[#4A7261] text-center uppercase"
                maxLength={8}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">RX CAN ID (Hex):</label>
              <input 
                type="text" 
                value={currentRxId.toString(16).toUpperCase()} 
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 16) || 0;
                  setCurrentRxId(parsed);
                }}
                className="bg-white border border-[#EBE7DF] rounded-lg px-2 py-1.5 text-xs font-mono tracking-widest text-[#4A7261] text-center uppercase"
                maxLength={8}
              />
            </div>
          </div>
        </div>

        {/* 4. CONSECUTIVE SECTIONS ISO-TP EDITOR BOX */}
        <div className="bg-[#FAF9F5] rounded-xl p-3 border border-[#EBE7DE] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider font-mono flex items-center gap-1 select-none">
              🚀 Редактор Consecutive кадров (ISO-TP payload)
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => selectPreset('17_launch')}
                className={`px-2 py-0.5 rounded-[5.5px] text-[8.5px] font-bold font-sans transition-all ${
                  writePreset === '17_launch' ? 'bg-[#4A7261] text-white' : 'bg-stone-100 text-stone-400 hover:text-stone-600'
                }`}
              >
                Launch Standard (17B)
              </button>
              <button
                type="button"
                onClick={() => selectPreset('38_legacy')}
                className={`px-2 py-0.5 rounded-[5.5px] text-[8.5px] font-bold font-sans transition-all ${
                  writePreset === '38_legacy' ? 'bg-[#4A7261] text-white' : 'bg-stone-100 text-stone-400 hover:text-stone-600'
                }`}
              >
                Legacy Patch (38B)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-stone-400 font-bold uppercase text-[8px] flex items-center justify-between">
                <span>Кадр 21 (HEX):</span>
                {writePreset === '17_launch' && <span className="text-[7.5px] lowercase text-[#4A7261]">(US288)</span>}
              </span>
              <input 
                type="text" 
                value={frame21Input} 
                onChange={(e) => setFrame21Input(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                className="bg-white border border-[#EBE7DF] rounded-md py-1 font-mono text-center text-stone-600 focus:outline-none"
                maxLength={14}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-stone-400 font-bold uppercase text-[8px] flex items-center justify-between">
                <span>Кадр 22 (HEX):</span>
                {writePreset === '17_launch' && <span className="text-[7.5px] lowercase text-[#4A7261]">(speed)</span>}
              </span>
              <input 
                type="text" 
                value={frame22Input} 
                onChange={(e) => setFrame22Input(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                className="bg-white border border-[#EBE7DF] rounded-md py-1 font-mono text-center text-stone-600 focus:outline-none"
                maxLength={14}
              />
            </div>

            {writePreset === '38_legacy' && (
              <>
                <div className="flex flex-col gap-0.5 col-span-1">
                  <span className="text-stone-400 font-bold uppercase text-[8px] flex items-center justify-between">
                    <span>Кадр 23 (HEX):</span>
                  </span>
                  <input 
                    type="text" 
                    value={frame23Input} 
                    onChange={(e) => setFrame23Input(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                    className="bg-white border border-[#EBE7DF] rounded-md py-1 font-mono text-center text-stone-600 focus:outline-none"
                    maxLength={14}
                  />
                </div>
                <div className="flex flex-col gap-0.5 col-span-1.5">
                  <span className="text-stone-400 font-bold uppercase text-[8px]">Кадр 24 (HEX):</span>
                  <input 
                    type="text" 
                    value={frame24Input} 
                    onChange={(e) => setFrame24Input(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                    className="bg-white border border-[#EBE7DF] rounded-md py-1 font-mono text-center text-stone-600 focus:outline-none"
                    maxLength={16}
                  />
                </div>
                <div className="flex flex-col gap-0.5 col-span-1.5">
                  <span className="text-stone-400 font-bold uppercase text-[8px]">Кадр 25 (HEX):</span>
                  <input 
                    type="text" 
                    value={frame25Input} 
                    onChange={(e) => setFrame25Input(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                    className="bg-white border border-[#EBE7DF] rounded-md py-1 font-mono text-center text-stone-600 focus:outline-none"
                    maxLength={16}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action Controls Panel */}
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={executeManualStep1HANDSHAKE}
              disabled={connectionStatus !== 'connected'}
              className="flex-1 bg-[#EEEDE9] text-stone-700 border border-[#D9D7CE] hover:bg-[#E5E3D8] disabled:bg-[#FAF9F5] disabled:text-stone-300 disabled:border-[#EBE7DF] py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 active:scale-98 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Шаг 1: Сессия / Seed
            </button>

            <button 
              type="button"
              onClick={handleMonolithicAutomatedTriggerBurn}
              disabled={connectionStatus !== 'connected' || isBlockedByLimits}
              className={`flex-[2] py-2.5 rounded-xl text-[11.5px] font-extrabold transition-all duration-200 flex items-center justify-center gap-1 shadow-sm select-none border cursor-pointer ${
                isBlockedByLimits 
                  ? 'bg-red-50 text-red-300 border-red-200 cursor-not-allowed' 
                  : 'bg-[#BACFC7] text-[#2C4A3E] border-[#A2BAAF] hover:bg-[#ABC2B9] active:scale-98'
              }`}
            >
              {writePreset === '17_launch' ? '🔥 ЗАПУСТИТЬ ЗАПИСЬ (UDS 17 БАЙТ)' : '🔥 ЗАПУСТИТЬ СТЕРИЛЬНЫЙ ПРОЖИГ (38 БАЙТ)'}
            </button>
          </div>

          <button 
            type="button"
            onClick={async () => {
              if (parentAddLog) {
                parentAddLog('[🔧 АВТОНОМИЯ]: Физический сброс ЭБУ через службу UDS 11 02...', 'info');
              }
              await transmitRawLawicell(`T${currentTxId.toString(16).toUpperCase()}8021102AAAAAAAAAA`);
            }}
            disabled={connectionStatus !== 'connected'}
            className="w-full bg-[#FFEAE5] text-[#933D25] border border-[#F4CCC2] hover:bg-[#FDDCD3] disabled:bg-[#FAF9F5] disabled:text-stone-300 disabled:border-[#EBE7DF] py-2 rounded-xl text-[10.5px] font-bold transition-colors cursor-pointer"
          >
            ⚙️ СБРОС ЭБУ (11 02 RESET)
          </button>
        </div>

      </div>
    </div>
  );
}
