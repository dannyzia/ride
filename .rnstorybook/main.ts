import type { StorybookConfig } from '@storybook/react-native';

const main: StorybookConfig = {
  stories: ['./stories/**/*.stories.?(ts|tsx|js|jsx)'],
  deviceAddons: ['@storybook/addon-ondevice-controls', '@storybook/addon-ondevice-actions'],
  addons: ['@storybook/addon-mcp'],
};

export default main;
