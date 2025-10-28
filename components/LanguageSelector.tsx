import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, Image } from "react-native";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";

interface LanguageSelectorProps {
  isVisible?: boolean;
  onSelectLanguage?: (language: 'en' | 'es' | 'ko') => void;
  onClose?: () => void;
}

const languages: { code: 'en' | 'es' | 'ko'; name: string; nativeName: string; flag: string }[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    flag: "https://api.dicebear.com/7.x/avataaars/svg?seed=usa-flag",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    flag: "https://api.dicebear.com/7.x/avataaars/svg?seed=spain-flag",
  },
  {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    flag: "https://api.dicebear.com/7.x/avataaars/svg?seed=korea-flag",
  },
];

export default function LanguageSelector({
  isVisible = true,
  onSelectLanguage = () => {},
  onClose = () => {},
}: LanguageSelectorProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'es' | 'ko'>("en");
  const router = useRouter();

  const handleConfirm = () => {
    onSelectLanguage(selectedLanguage);
    onClose();
  };

  const getWelcomeMessage = () => {
    switch (selectedLanguage) {
      case "en":
        return "Welcome to HashPass";
      case "es":
        return "Bienvenido a HashPass";
      case "ko":
        return "해시패스에 오신 것을 환영합니다";
      default:
        return "Welcome to HashPass";
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="bg-white w-[350px] rounded-xl p-6 shadow-lg">
          <Text className="text-2xl font-bold text-center mb-2">
            {getWelcomeMessage()}
          </Text>

          <Text className="text-center text-gray-600 mb-6">
            Please select your preferred language
          </Text>

          <View className="space-y-4">
            {languages.map((language) => (
              <TouchableOpacity
                key={language.code}
                className={`flex-row items-center p-3 rounded-lg border ${selectedLanguage === language.code ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
                onPress={() => setSelectedLanguage(language.code)}
              >
                <Image
                  source={{ uri: language.flag }}
                  className="w-8 h-8 rounded-full"
                />
                <View className="ml-3 flex-1">
                  <Text className="font-medium">{language.nativeName}</Text>
                  <Text className="text-gray-500 text-sm">{language.name}</Text>
                </View>
                {selectedLanguage === language.code && (
                  <Check size={20} color="#3b82f6" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            className="mt-6 bg-blue-500 py-3 px-4 rounded-lg"
            onPress={handleConfirm}
          >
            <Text className="text-white text-center font-medium">Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
