
'use client';

import * as React from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/firebase';
import { initiateEmailSignUp, initiateEmailSignIn } from '@/firebase/non-blocking-login';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { doc, getFirestore } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z
    .string()
    .min(6, { message: 'Password must be at least 6 characters long.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface AuthFormProps {
  type: 'signin' | 'signup';
  onSuccess?: () => void;
}

export function AuthForm({ type, onSuccess }: AuthFormProps) {
  const auth = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setIsLoading(true);
    try {
      if (type === 'signup') {
        // Use non-blocking sign-up
        initiateEmailSignUp(auth, data.email, data.password);
        
        // We can't get the user immediately, so we'll rely on onAuthStateChanged
        // to create the user document. A more robust solution might use a cloud function
        // to ensure the user doc is created. For now, we'll show a pending toast.
         toast({
          title: 'Account Created!',
          description: "We're setting up your profile. You will be logged in shortly.",
        });

      } else {
        // Use non-blocking sign-in
        initiateEmailSignIn(auth, data.email, data.password);
        toast({
          title: 'Signing In...',
          description: 'Please wait.',
        });
      }
      
      // The parent component will handle the user state change via onAuthStateChanged
      // and close the form.
      
    } catch (error: any) {
      console.error(`${type} error:`, error);
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: error.message || `Could not ${type}. Please try again.`,
      });
      setIsLoading(false);
    }
    // Don't set isLoading to false here for the success case, 
    // as the component will unmount on success.
  };
  

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading
            ? 'Processing...'
            : type === 'signup'
            ? 'Create Account'
            : 'Sign In'}
        </Button>
      </form>
    </Form>
  );
}
