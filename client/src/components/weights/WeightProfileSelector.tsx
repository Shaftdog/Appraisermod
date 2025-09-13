import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Save, Edit2, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WeightProfile, WeightSet, ConstraintSet } from "@shared/schema";

interface WeightProfileSelectorProps {
  profiles: WeightProfile[];
  selectedProfileId?: string;
  currentWeights: WeightSet;
  currentConstraints: ConstraintSet;
  onProfileSelect: (profile: WeightProfile) => void;
  onProfileSave: (name: string, description?: string) => Promise<void>;
  onProfileUpdate: (profileId: string, name: string, description?: string) => Promise<void>;
  onProfileDelete: (profileId: string) => Promise<void>;
  disabled?: boolean;
}

export function WeightProfileSelector({
  profiles,
  selectedProfileId,
  currentWeights,
  currentConstraints,
  onProfileSelect,
  onProfileSave,
  onProfileUpdate,
  onProfileDelete,
  disabled = false
}: WeightProfileSelectorProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  const isShopDefault = selectedProfile?.scope === 'shop';

  const handleProfileSelect = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      onProfileSelect(profile);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      toast({
        title: "Error",
        description: "Profile name is required",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      await onProfileSave(profileName.trim(), profileDescription.trim() || undefined);
      setSaveDialogOpen(false);
      setProfileName("");
      setProfileDescription("");
      toast({
        title: "Success",
        description: "Profile saved successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save profile",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!selectedProfileId || !profileName.trim()) {
      toast({
        title: "Error", 
        description: "Profile name is required",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      await onProfileUpdate(selectedProfileId, profileName.trim(), profileDescription.trim() || undefined);
      setUpdateDialogOpen(false);
      setProfileName("");
      setProfileDescription("");
      toast({
        title: "Success",
        description: "Profile updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileId) return;

    try {
      await onProfileDelete(selectedProfileId);
      toast({
        title: "Success",
        description: "Profile deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete profile",
        variant: "destructive"
      });
    }
  };

  const openUpdateDialog = () => {
    if (selectedProfile) {
      setProfileName(selectedProfile.name);
      setProfileDescription(selectedProfile.description || "");
      setUpdateDialogOpen(true);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-foreground">
        Weight Profile
      </Label>
      
      <div className="flex gap-2">
        <Select 
          value={selectedProfileId || ""} 
          onValueChange={handleProfileSelect}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1" data-testid="select-profile">
            <SelectValue placeholder="Select a profile..." />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{profile.name}</span>
                  {profile.description && (
                    <span className="text-xs text-muted-foreground">
                      {profile.description}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {profile.scope === 'shop' ? 'Shop Default' : `By ${profile.author}`}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              disabled={disabled}
              data-testid="button-save-profile"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save as New Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="profile-name">Profile Name</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Enter profile name..."
                  data-testid="input-profile-name"
                />
              </div>
              <div>
                <Label htmlFor="profile-description">Description (optional)</Label>
                <Textarea
                  id="profile-description"
                  value={profileDescription}
                  onChange={(e) => setProfileDescription(e.target.value)}
                  placeholder="Describe when to use this profile..."
                  rows={3}
                  data-testid="input-profile-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSaveDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveProfile}
                disabled={isSaving}
                data-testid="button-confirm-save"
              >
                {isSaving ? "Saving..." : "Save Profile"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {selectedProfile && (
        <div className="flex gap-2">
          <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                disabled={disabled || isShopDefault}
                data-testid="button-update-profile"
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Update
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update Profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="update-profile-name">Profile Name</Label>
                  <Input
                    id="update-profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Enter profile name..."
                  />
                </div>
                <div>
                  <Label htmlFor="update-profile-description">Description (optional)</Label>
                  <Textarea
                    id="update-profile-description"
                    value={profileDescription}
                    onChange={(e) => setProfileDescription(e.target.value)}
                    placeholder="Describe when to use this profile..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setUpdateDialogOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateProfile}
                  disabled={isSaving}
                >
                  {isSaving ? "Updating..." : "Update Profile"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                disabled={disabled || isShopDefault}
                data-testid="button-delete-profile"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{selectedProfile.name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteProfile}
                  data-testid="button-confirm-delete"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {selectedProfile && (
        <div className="text-xs text-muted-foreground">
          <p>
            <span className="font-medium">Active:</span> {selectedProfile.name}
            {selectedProfile.scope === 'shop' && " (Read-only)"}
          </p>
          {selectedProfile.description && (
            <p className="mt-1">{selectedProfile.description}</p>
          )}
        </div>
      )}
    </div>
  );
}