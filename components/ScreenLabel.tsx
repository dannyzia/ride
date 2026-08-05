import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/goRide';

interface ScreenLabelProps {
  screenName: string;
  screenNumber?: number;
}

const ScreenLabel = ({ screenName, screenNumber }: ScreenLabelProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {screenName}
        {screenNumber !== undefined ? ` ${screenNumber}` : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  label: {
    fontSize: 10,
    color: colors.textSecondaryLight,
    fontWeight: '300',
  },
});

export default ScreenLabel;