export type CloudinaryNativeUploadPart = {
  uri: string;
  name: string;
  type: string;
};

export type CloudinaryUploadPart = Blob | CloudinaryNativeUploadPart;
