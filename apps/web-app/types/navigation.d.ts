import { NavigatorScreenParams } from '@react-navigation/native';

// Define the tab navigator params
export type TabParamList = {
  index: undefined;
  explore: undefined;
  profile: undefined;
  wallet: undefined;
};

// Define the root stack param list
export type RootStackParamList = {
  // Screens that can be navigated to from the drawer
  index: undefined;
  profile: undefined;
  explore: undefined;
  wallet: undefined;
};


// Define the drawer param list
export type RootDrawerParamList = {
  Main: undefined;
};

// This helps with type checking the navigation prop
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

// Helper type to extract route names
export type RouteName = keyof RootStackParamList;
