import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import {
  Search,
  Filter,
  Calendar,
  MapPin,
  Ticket,
  Coins,
} from "lucide-react-native";

interface Event {
  id: string;
  name: string;
  date: string;
  location: string;
  price: string;
  tokenRewards: number;
  image: string;
  type: "concert" | "festival" | "sports" | "theater";
}

interface EventDiscoveryProps {
  events?: Event[];
  onEventSelect?: (event: Event) => void;
}

const EventDiscovery = ({
  events = [
    {
      id: "1",
      name: "Summer Music Festival",
      date: "Jun 15-17, 2023",
      location: "Central Park, New York",
      price: "$120",
      tokenRewards: 200,
      image:
        "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80",
      type: "festival",
    },
    {
      id: "2",
      name: "Rock Concert Live",
      date: "Jul 22, 2023",
      location: "Madison Square Garden",
      price: "$85",
      tokenRewards: 100,
      image:
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&q=80",
      type: "concert",
    },
    {
      id: "3",
      name: "Basketball Championship",
      date: "Aug 5, 2023",
      location: "Staples Center, LA",
      price: "$150",
      tokenRewards: 150,
      image:
        "https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80",
      type: "sports",
    },
    {
      id: "4",
      name: "Broadway Show",
      date: "Sep 10, 2023",
      location: "Broadway Theater",
      price: "$95",
      tokenRewards: 120,
      image:
        "https://images.unsplash.com/photo-1503095396549-807759245b35?w=800&q=80",
      type: "theater",
    },
  ],
  onEventSelect = () => {},
}: EventDiscoveryProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const filterTypes = [
    { id: "all", label: "All" },
    { id: "concert", label: "Concerts" },
    { id: "festival", label: "Festivals" },
    { id: "sports", label: "Sports" },
    { id: "theater", label: "Theater" },
  ];

  const filteredEvents = events.filter((event) => {
    // Apply search filter
    if (
      searchQuery &&
      !event.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Apply type filter
    if (activeFilter && activeFilter !== "all" && event.type !== activeFilter) {
      return false;
    }

    return true;
  });

  return (
    <View className="flex-1 bg-white p-4">
      {/* Search Bar */}
      <View className="flex-row items-center bg-gray-100 rounded-full px-4 py-2 mb-4">
        <Search size={20} color="#666" />
        <TouchableOpacity
          className="flex-1 ml-2"
          onPress={() => console.log("Open search input")}
        >
          <Text className="text-gray-500">Search events...</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => console.log("Open filters")}>
          <Filter size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Filter Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-4"
      >
        {filterTypes.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            className={`px-4 py-2 mr-2 rounded-full ${activeFilter === filter.id ? "bg-blue-500" : "bg-gray-200"}`}
            onPress={() =>
              setActiveFilter(filter.id === activeFilter ? null : filter.id)
            }
          >
            <Text
              className={`${activeFilter === filter.id ? "text-white" : "text-gray-800"}`}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Events List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              className="bg-white rounded-xl mb-4 overflow-hidden shadow-sm border border-gray-200"
              onPress={() => onEventSelect(event)}
            >
              <Image
                source={{ uri: event.image }}
                className="w-full h-40"
                resizeMode="cover"
              />
              <View className="p-4">
                <Text className="text-lg font-bold">{event.name}</Text>

                <View className="flex-row items-center mt-2">
                  <Calendar size={16} color="#666" />
                  <Text className="text-gray-600 ml-2">{event.date}</Text>
                </View>

                <View className="flex-row items-center mt-2">
                  <MapPin size={16} color="#666" />
                  <Text className="text-gray-600 ml-2">{event.location}</Text>
                </View>

                <View className="flex-row justify-between items-center mt-3">
                  <View className="flex-row items-center">
                    <Ticket size={16} color="#666" />
                    <Text className="text-gray-800 font-bold ml-2">
                      {event.price}
                    </Text>
                  </View>

                  <View className="flex-row items-center bg-amber-100 px-3 py-1 rounded-full">
                    <Coins size={16} color="#d97706" />
                    <Text className="text-amber-600 font-bold ml-1">
                      {event.tokenRewards} tokens
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-gray-500 text-lg">No events found</Text>
            <Text className="text-gray-400 mt-2">
              Try adjusting your filters
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default EventDiscovery;
