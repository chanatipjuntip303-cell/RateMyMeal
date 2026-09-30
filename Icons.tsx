import React from 'react';
import { View, StyleSheet } from 'react-native';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Minimalist Outline Line Art Icons
 * Custom React Native implementation ensuring zero external dependencies,
 * crisp vector-like geometry, and 100% strict compatibility with the 4-color palette.
 */

export const CameraIcon: React.FC<IconProps> = ({ size = 20, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Top Bump (Shutter flash) */}
      <View
        style={{
          width: s * 0.35,
          height: s * 0.15,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          backgroundColor: color,
          marginBottom: -1,
        }}
      />
      {/* Camera Body */}
      <View
        style={{
          width: s * 0.9,
          height: s * 0.65,
          borderWidth: 1.6,
          borderColor: color,
          borderRadius: s * 0.15,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Center Lens */}
        <View
          style={{
            width: s * 0.36,
            height: s * 0.36,
            borderRadius: s * 0.18,
            borderWidth: 1.5,
            borderColor: color,
          }}
        />
      </View>
    </View>
  );
};

export const GalleryIcon: React.FC<IconProps> = ({ size = 20, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderWidth: 1.6,
        borderColor: color,
        borderRadius: s * 0.15,
        overflow: 'hidden',
        padding: s * 0.1,
        justifyContent: 'space-between',
      }}
    >
      {/* Sun / Moon */}
      <View
        style={{
          width: s * 0.22,
          height: s * 0.22,
          borderRadius: s * 0.11,
          backgroundColor: color,
          alignSelf: 'flex-end',
        }}
      />
      {/* Mountain peaks */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: s * 0.38 }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: s * 0.22,
            borderRightWidth: s * 0.22,
            borderBottomWidth: s * 0.32,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
          }}
        />
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: s * 0.18,
            borderRightWidth: s * 0.18,
            borderBottomWidth: s * 0.24,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
            marginLeft: -s * 0.08,
          }}
        />
      </View>
    </View>
  );
};

export const HistoryIcon: React.FC<IconProps> = ({ size = 20, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s * 0.5,
        borderWidth: 1.6,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Clock hands */}
      <View
        style={{
          position: 'absolute',
          top: s * 0.18,
          width: 1.6,
          height: s * 0.32,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: s * 0.45,
          top: s * 0.45,
          width: s * 0.25,
          height: 1.6,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      <View
        style={{
          width: 3,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

export const SettingsIcon: React.FC<IconProps> = ({ size = 20, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer Gear ring */}
      <View
        style={{
          width: s * 0.85,
          height: s * 0.85,
          borderRadius: s * 0.425,
          borderWidth: 1.8,
          borderColor: color,
          borderStyle: 'dashed',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Inner Hub */}
        <View
          style={{
            width: s * 0.35,
            height: s * 0.35,
            borderRadius: s * 0.175,
            borderWidth: 1.5,
            borderColor: color,
          }}
        />
      </View>
    </View>
  );
};

export const FlameIcon: React.FC<IconProps> = ({ size = 20, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.65,
          height: s * 0.85,
          borderTopLeftRadius: s * 0.45,
          borderTopRightRadius: s * 0.1,
          borderBottomLeftRadius: s * 0.45,
          borderBottomRightRadius: s * 0.45,
          transform: [{ rotate: '-45deg' }],
          borderWidth: 1.6,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: s * 0.28,
            height: s * 0.38,
            borderRadius: s * 0.18,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
};

export const RefreshIcon: React.FC<IconProps> = ({ size = 18, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.78,
          height: s * 0.78,
          borderRadius: s * 0.39,
          borderWidth: 1.6,
          borderColor: color,
          borderTopColor: 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: s * 0.05,
          right: s * 0.18,
          width: 0,
          height: 0,
          borderLeftWidth: 3.5,
          borderRightWidth: 3.5,
          borderBottomWidth: 5,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
};

export const SwapIcon: React.FC<IconProps> = ({ size = 18, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, justifyContent: 'center', gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ height: 1.6, width: s * 0.6, backgroundColor: color }} />
        <View
          style={{
            width: 0,
            height: 0,
            borderTopWidth: 3,
            borderBottomWidth: 3,
            borderLeftWidth: 4,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderLeftColor: color,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderTopWidth: 3,
            borderBottomWidth: 3,
            borderRightWidth: 4,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderRightColor: color,
          }}
        />
        <View style={{ height: 1.6, width: s * 0.6, backgroundColor: color }} />
      </View>
    </View>
  );
};

export const PlateIcon: React.FC<IconProps> = ({ size = 18, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Dome */}
      <View
        style={{
          width: s * 0.65,
          height: s * 0.35,
          borderTopLeftRadius: s * 0.35,
          borderTopRightRadius: s * 0.35,
          borderWidth: 1.6,
          borderColor: color,
          borderBottomWidth: 0,
        }}
      />
      {/* Dome Top Knob */}
      <View
        style={{
          position: 'absolute',
          top: s * 0.16,
          width: 3.5,
          height: 3.5,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
      {/* Bottom Plate line */}
      <View
        style={{
          width: s * 0.85,
          height: 1.8,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
    </View>
  );
};

export const ProteinIcon: React.FC<IconProps> = ({ size = 16, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View
      style={{
        width: s,
        height: s,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 2.5, height: s * 0.7, backgroundColor: color, borderRadius: 1 }} />
      <View
        style={{
          width: 2.5,
          height: s * 0.5,
          backgroundColor: color,
          borderRadius: 1,
          marginLeft: 1,
        }}
      />
      <View style={{ width: s * 0.35, height: 2, backgroundColor: color }} />
      <View
        style={{
          width: 2.5,
          height: s * 0.5,
          backgroundColor: color,
          borderRadius: 1,
          marginRight: 1,
        }}
      />
      <View style={{ width: 2.5, height: s * 0.7, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
};

export const CarbsIcon: React.FC<IconProps> = ({ size = 16, color = '#CC6F00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.7,
          height: s * 0.45,
          borderRadius: s * 0.22,
          borderWidth: 1.6,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ height: s * 0.3, width: 1.2, backgroundColor: color }} />
      </View>
    </View>
  );
};

export const FatIcon: React.FC<IconProps> = ({ size = 16, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.55,
          height: s * 0.75,
          borderTopLeftRadius: s * 0.3,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: s * 0.3,
          borderBottomRightRadius: s * 0.3,
          transform: [{ rotate: '-45deg' }],
          borderWidth: 1.6,
          borderColor: color,
        }}
      />
    </View>
  );
};

export const CoachIcon: React.FC<IconProps> = ({ size = 18, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Speech balloon */}
      <View
        style={{
          width: s * 0.85,
          height: s * 0.6,
          borderRadius: s * 0.15,
          borderWidth: 1.6,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: s * 0.4, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
      </View>
      {/* Tail */}
      <View
        style={{
          alignSelf: 'flex-start',
          marginLeft: s * 0.25,
          width: 0,
          height: 0,
          borderTopWidth: 4,
          borderRightWidth: 4,
          borderTopColor: color,
          borderRightColor: 'transparent',
          marginTop: -1,
        }}
      />
    </View>
  );
};

export const CloudIcon: React.FC<IconProps> = ({ size = 16, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.8,
          height: s * 0.48,
          borderWidth: 1.6,
          borderColor: color,
          borderRadius: s * 0.24,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: s * 0.18,
          width: s * 0.42,
          height: s * 0.42,
          borderRadius: s * 0.21,
          borderWidth: 1.6,
          borderColor: color,
          borderBottomColor: 'transparent',
        }}
      />
    </View>
  );
};

export const KeyIcon: React.FC<IconProps> = ({ size = 18, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View
      style={{
        width: s,
        height: s,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: s * 0.42,
          height: s * 0.42,
          borderRadius: s * 0.21,
          borderWidth: 1.6,
          borderColor: color,
        }}
      />
      <View style={{ width: s * 0.45, height: 2, backgroundColor: color, marginLeft: -1 }}>
        <View
          style={{
            position: 'absolute',
            right: 2,
            top: 2,
            width: 2,
            height: 3,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
};

export const EyeIcon: React.FC<IconProps & { closed?: boolean }> = ({
  size = 16,
  color = '#4D2A00',
  closed = false,
}) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.85,
          height: s * 0.5,
          borderTopLeftRadius: s * 0.4,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: s * 0.4,
          transform: [{ rotate: '45deg' }],
          borderWidth: 1.6,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: s * 0.22,
            height: s * 0.22,
            borderRadius: s * 0.11,
            backgroundColor: color,
          }}
        />
      </View>
      {closed && (
        <View
          style={{
            position: 'absolute',
            width: s * 0.8,
            height: 1.8,
            backgroundColor: color,
            transform: [{ rotate: '-45deg' }],
          }}
        />
      )}
    </View>
  );
};

export const CpuIcon: React.FC<IconProps> = ({ size = 18, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.65,
          height: s * 0.65,
          borderRadius: 3,
          borderWidth: 1.6,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: s * 0.25,
            height: s * 0.25,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      </View>
      {/* Pins */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: s * 0.4,
          height: 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: s * 0.4,
          height: 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          height: s * 0.4,
          width: 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          height: s * 0.4,
          width: 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

export const FlaskIcon: React.FC<IconProps> = ({ size = 18, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Neck */}
      <View
        style={{
          width: s * 0.22,
          height: s * 0.35,
          borderWidth: 1.6,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: 1,
          borderTopRightRadius: 1,
        }}
      />
      {/* Conical base */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: s * 0.35,
          borderRightWidth: s * 0.35,
          borderBottomWidth: s * 0.45,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          marginTop: -1,
        }}
      />
    </View>
  );
};

export const SaveIcon: React.FC<IconProps> = ({ size = 18, color = '#F9E6A8' }) => {
  const s = size;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderWidth: 1.6,
        borderColor: color,
        borderRadius: 3,
        padding: 2,
        justifyContent: 'space-between',
      }}
    >
      <View
        style={{
          height: s * 0.28,
          backgroundColor: color,
          width: s * 0.5,
          alignSelf: 'center',
          borderRadius: 1,
        }}
      />
      <View
        style={{
          height: s * 0.35,
          borderWidth: 1,
          borderColor: color,
          borderRadius: 2,
        }}
      />
    </View>
  );
};

export const CheckIcon: React.FC<IconProps> = ({ size = 16, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.6,
          height: s * 0.35,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          transform: [{ rotate: '-45deg' }],
          marginTop: -s * 0.1,
        }}
      />
    </View>
  );
};

export const CloseIcon: React.FC<IconProps> = ({ size = 16, color = '#CC6F00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: s * 0.7,
          height: 2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: s * 0.7,
          height: 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
};

export const AlertIcon: React.FC<IconProps> = ({ size = 16, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: s * 0.42,
          borderRightWidth: s * 0.42,
          borderBottomWidth: s * 0.75,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: s * 0.28,
          width: 1.8,
          height: s * 0.25,
          backgroundColor: '#F9E6A8',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: s * 0.16,
          width: 1.8,
          height: 1.8,
          borderRadius: 1,
          backgroundColor: '#F9E6A8',
        }}
      />
    </View>
  );
};

export const InfoIcon: React.FC<IconProps> = ({ size = 16, color = '#4D2A00' }) => {
  const s = size;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s * 0.5,
        borderWidth: 1.6,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 2,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
          marginBottom: 1.5,
        }}
      />
      <View style={{ width: 1.8, height: s * 0.32, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
};

export const ChevronIcon: React.FC<IconProps & { direction?: 'up' | 'down' | 'right' }> = ({
  size = 12,
  color = '#CC6F00',
  direction = 'down',
}) => {
  const s = size;
  const rotation = direction === 'up' ? '-135deg' : direction === 'right' ? '-45deg' : '45deg';
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: s * 0.5,
          height: s * 0.5,
          borderBottomWidth: 1.8,
          borderRightWidth: 1.8,
          borderColor: color,
          transform: [{ rotate: rotation }],
        }}
      />
    </View>
  );
};
