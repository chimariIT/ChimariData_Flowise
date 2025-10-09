import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Bell } from "lucide-react";

interface ComingSoonProps {
  onBack: () => void;
  pageTitle?: string;
}

export default function ComingSoon({ onBack, pageTitle = "Feature" }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-4">
        <div className="mb-8">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            {pageTitle} Coming Soon
          </h1>
          <p className="text-lg text-slate-600 mb-8">
            We're working hard to bring you this feature. Stay tuned for updates!
          </p>
        </div>

        <div className="space-y-4">
          <Button
            onClick={onBack}
            variant="outline"
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          
          <div className="text-sm text-slate-500">
            Want to be notified when this feature launches? Contact us at{" "}
            <a 
              href="mailto:updates@chimaridata.com?subject=Feature Update Notification" 
              className="text-blue-600 hover:underline"
            >
              updates@chimaridata.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}