import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  index: undefined;
  explore: undefined;
  profile: undefined;
  wallet: undefined;
};

export type RootStackParamList = {
  index: undefined;
  profile: undefined;
  explore: undefined;
  wallet: undefined;
};

export type RootDrawerParamList = {
  Main: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

export type RouteName = keyof RootStackParamList;
