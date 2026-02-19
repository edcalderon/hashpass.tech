import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import {
  ChevronLeft,
  ChevronRight,
  Ticket,
  AlertCircle,
} from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useTranslation } from "../i18n/i18n";

interface TicketProps {
  id: string;
  eventName: string;
  date: string;
  location: string;
  accessLevel: string;
  earnedTokens: number;
  qrCode: string;
  image?: string;
}

interface DigitalTicketWalletProps {
  tickets?: TicketProps[];
  onTicketSelect?: (ticket: TicketProps) => void;
}

const DigitalTicketWallet = ({
  tickets = [
    {
      id: "1",
      eventName: "Summer Music Festival",
      date: "June 15, 2023 - 2:00 PM",
      location: "Central Park, New York",
      accessLevel: "VIP",
      earnedTokens: 50,
      qrCode:
        "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=ticket-id-123456",
      image:
        "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=500&q=80",
    },
    {
      id: "2",
      eventName: "Tech Conference 2023",
      date: "July 10, 2023 - 9:00 AM",
      location: "Convention Center, San Francisco",
      accessLevel: "FIRST ROW",
      earnedTokens: 100,
      qrCode:
        "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=ticket-id-789012",
      image:
        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=500&q=80",
    },
    {
      id: "3",
      eventName: "Art Exhibition",
      date: "August 5, 2023 - 11:00 AM",
      location: "Modern Art Museum, Chicago",
      accessLevel: "FULL ACCESS",
      earnedTokens: 200,
      qrCode:
        "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=ticket-id-345678",
      image:
        "https://images.unsplash.com/photo-1501084817091-a4f3d1d19e07?w=500&q=80",
    },
  ],
}: DigitalTicketWalletProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const { t } = useTranslation('digitalWallet');

  const qrScale = useSharedValue(1);

  const qrAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: qrScale.value }],
    };
  });

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < tickets.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const toggleQRCode = (qrCode: string) => {
    if (expandedQR === qrCode) {
      qrScale.value = withSpring(1);
      setTimeout(() => setExpandedQR(null), 300);
    } else {
      setExpandedQR(qrCode);
      qrScale.value = withSpring(1.5);
    }
  };

  if (tickets.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6 bg-gray-100 dark:bg-gray-900">
        <View className="bg-white dark:bg-gray-800 rounded-xl p-8 items-center shadow-md w-full">
          <Ticket size={64} className="text-indigo-500 dark:text-indigo-400" />
          <Text className="text-2xl font-bold mt-4 text-center text-gray-900 dark:text-white">
            {t("noTickets")}
          </Text>
          <Text className="text-gray-500 dark:text-gray-300 text-center mt-2">
            {t("noTicketsDesc")}
          </Text>
          <TouchableOpacity
            className="mt-6 bg-indigo-600 dark:bg-indigo-700 py-3 px-6 rounded-full"
            onPress={() => {}}
          >
            <Text className="text-white font-semibold">{t("discoverEvents")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentTicket = tickets[currentIndex];

  return (
    <View className="flex-1 dark:bg-gray-900 p-4 rounded-xl shadow-sm">
      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg mb-4 border border-gray-200 dark:border-gray-700">
        {currentTicket.image && (
          <Image
            source={{ uri: currentTicket.image }}
            className="w-full h-40"
            contentFit="cover"
            transition={200}
          />
        )}

        <View className="p-4">
          <Text className="text-xl font-bold text-gray-900 dark:text-white">{currentTicket.eventName}</Text>
          <View className="flex-row items-center mt-2">
            <Text className="text-gray-600 dark:text-gray-300">{currentTicket.date}</Text>
          </View>
          <Text className="text-gray-600 dark:text-gray-300 mt-1">{currentTicket.location}</Text>

          <View className="flex-row justify-between items-center mt-4">
            <View className="bg-indigo-100 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
              <Text className="text-indigo-800 dark:text-indigo-300 font-medium">
                {currentTicket.accessLevel}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-amber-600 dark:text-amber-400 font-bold mr-1">
                {currentTicket.earnedTokens}
              </Text>
              <Text className="text-gray-600 dark:text-gray-400">{t("tokensEarned")}</Text>
            </View>
          </View>

          <TouchableOpacity
            className="mt-4 items-center"
            onPress={() => toggleQRCode(currentTicket.qrCode)}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                expandedQR === currentTicket.qrCode ? qrAnimatedStyle : {},
              ]}
              className="bg-white dark:bg-gray-700 p-2 rounded-lg"
            >
              <Image
                source={{ uri: currentTicket.qrCode }}
                className="w-32 h-32"
                contentFit="contain"
              />
            </Animated.View>
            <Text className="text-gray-500 dark:text-gray-400 mt-2">
              {expandedQR === currentTicket.qrCode
                ? t("tapToMinimize")
                : t("tapToEnlarge")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Controls */}
      <View className="flex-row justify-between items-center mt-4">
        <TouchableOpacity
          className={`p-2 rounded-full ${currentIndex === 0 ? "bg-gray-200 dark:bg-gray-700" : "bg-indigo-500 dark:bg-indigo-600"}`}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
        >
          <ChevronLeft
            size={24}
            color={currentIndex === 0 ? "#9ca3af" : "white"}
          />
        </TouchableOpacity>

        <Text className="text-gray-600 dark:text-gray-300">
          {currentIndex + 1} {t("of")} {tickets.length}
        </Text>

        <TouchableOpacity
          className={`p-2 rounded-full ${
            currentIndex === tickets.length - 1
              ? "bg-gray-200 dark:bg-gray-700"
              : "bg-indigo-500 dark:bg-indigo-600"
          }`}
          onPress={handleNext}
          disabled={currentIndex === tickets.length - 1}
        >
          <ChevronRight
            size={24}
            color={currentIndex === tickets.length - 1 ? "#9ca3af" : "white"}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-4"
      >
        <View className="flex-row space-x-2">
          {tickets.map((_, index) => (
            <View
              key={index}
              className={`h-2 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? "bg-indigo-500 dark:bg-indigo-400 w-6"
                  : "bg-gray-300 dark:bg-gray-600 w-2"
              }`}
            />
          ))}
        </View>
      </ScrollView>

      <View className="mt-4 bg-amber-50 p-3 rounded-lg flex-row items-center">
        <AlertCircle size={20} color="#d97706" />
        <Text className="ml-2 text-amber-700">
          {t("presentQR")}
        </Text>
      </View>
    </View>
  );
};

export default DigitalTicketWallet;
