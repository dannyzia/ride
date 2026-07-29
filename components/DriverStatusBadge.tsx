import { View, Text } from 'react-native';

interface DriverStatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active:     { bg: 'bg-goGreenVariant', text: 'text-white', label: 'Active' },
  pending:    { bg: 'bg-goAmber', text: 'text-white', label: 'Pending' },
  suspended:  { bg: 'bg-goDanger', text: 'text-white', label: 'Suspended' },
  inactive:   { bg: 'bg-gray-400',  text: 'text-white', label: 'Inactive' },
  rejected:   { bg: 'bg-goDanger', text: 'text-white', label: 'Rejected' },
};

export default function DriverStatusBadge({ status }: DriverStatusBadgeProps) {
  const style = STATUS_STYLES[status.toLowerCase()] ?? STATUS_STYLES.inactive;

  return (
    <View className={`px-3 py-1 rounded-full ${style.bg}`}>
      <Text className={`text-xs font-Jakarta font-semibold ${style.text}`}>{style.label}</Text>
    </View>
  );
}
